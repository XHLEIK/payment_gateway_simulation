import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { Refund, RefundStatus } from './entities/refund.entity';
import { TransactionsService } from '../transactions/transactions.service';
import { TransactionStatus, TransactionType } from '../transactions/entities/transaction.entity';
import { AnalyticsService } from '../analytics/analytics.service';

@Injectable()
export class RefundsService {
  constructor(
    @InjectRepository(Refund)
    private readonly refundRepository: Repository<Refund>,
    private readonly transactionsService: TransactionsService,
    private readonly dataSource: DataSource,
    private readonly analyticsService: AnalyticsService,
  ) {}

  // 1. Request a refund (Initiates a PENDING refund request)
  async request(dto: {
    transactionId: string;
    amount: number;
    reason: string;
  }): Promise<Refund> {
    const { transactionId, amount, reason } = dto;

    if (amount <= 0) {
      throw new BadRequestException('Refund amount must be positive');
    }

    const transaction = await this.transactionsService.findOne(transactionId);
    if (transaction.status !== TransactionStatus.SUCCESS) {
      throw new BadRequestException(
        `Only successful transactions can be refunded. Current status is ${transaction.status}`,
      );
    }

    if (amount > transaction.amount) {
      throw new BadRequestException('Refund amount cannot exceed original transaction amount');
    }

    // Accumulate existing approved and pending refunds to prevent double-refunding
    const existingRefunds = await this.refundRepository.find({
      where: { transactionId },
    });
    
    const totalRefundedOrPending = existingRefunds
      .filter((r) => r.status !== RefundStatus.REJECTED)
      .reduce((sum, r) => sum + r.amount, 0);

    if (totalRefundedOrPending + amount > transaction.amount) {
      throw new BadRequestException('Total requested refunds exceed original transaction amount');
    }

    const refund = this.refundRepository.create({
      transactionId,
      amount,
      reason,
      status: RefundStatus.PENDING,
    });

    return this.refundRepository.save(refund);
  }

  // 2. Approve a refund (Triggers state machine transition & wallet adjustment atomically)
  async approve(refundId: string, adminId: string, correlationId?: string): Promise<Refund> {
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const refundRepo = manager.getRepository(Refund);
      
      const refund = await refundRepo.findOne({
        where: { id: refundId },
        relations: { transaction: true },
      });

      if (!refund) {
        throw new NotFoundException(`Refund request ${refundId} not found`);
      }

      if (refund.status !== RefundStatus.PENDING) {
        throw new BadRequestException(`Refund request has already been ${refund.status}`);
      }

      // Transition original transaction status to REFUNDED (credits/debits wallet balance atomically)
      await this.transactionsService.transitionStatus(
        refund.transactionId,
        TransactionStatus.REFUNDED,
        undefined,
        `admin:${adminId}`,
        correlationId,
        manager,
      );

      // Approve refund record
      refund.status = RefundStatus.APPROVED;
      refund.approvedById = adminId;

      const savedRefund = await refundRepo.save(refund);

      // Update daily aggregated stats to record this refund volume/count
      const today = new Date().toISOString().split('T')[0];
      await this.analyticsService.updateDailyStats(
        today,
        true,
        refund.amount,
        TransactionType.REFUND,
        manager,
      );

      return savedRefund;
    });
  }

  // 3. Reject a refund claim
  async reject(refundId: string, adminId: string): Promise<Refund> {
    const refund = await this.refundRepository.findOne({ where: { id: refundId } });
    if (!refund) {
      throw new NotFoundException(`Refund request ${refundId} not found`);
    }

    if (refund.status !== RefundStatus.PENDING) {
      throw new BadRequestException(`Refund request has already been ${refund.status}`);
    }

    refund.status = RefundStatus.REJECTED;
    refund.approvedById = adminId;

    return this.refundRepository.save(refund);
  }

  // Lists all refund applications, including original user profiles
  async findAll(): Promise<Refund[]> {
    return this.refundRepository.find({
      relations: { transaction: { user: true }, approvedBy: true },
      order: { createdAt: 'DESC' },
    });
  }
}
