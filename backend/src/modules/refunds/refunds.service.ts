import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { Refund, RefundStatus } from './entities/refund.entity';
import { TransactionsService } from '../transactions/transactions.service';
import { TransactionStatus } from '../transactions/entities/transaction.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';

@Injectable()
export class RefundsService {
  constructor(
    @InjectRepository(Refund)
    private readonly refundRepository: Repository<Refund>,
    private readonly transactionsService: TransactionsService,
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
  ) {}

  // 1. Request a refund (Initiates a PENDING refund)
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

    // Verify if there is already a PENDING or APPROVED refund for this transaction
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

      const saved = await refundRepo.save(refund);

      // Fire notification to transaction owner
      await this.notificationsService.create(
        refund.transaction.userId,
        NotificationType.REFUND_APPROVED,
        'Refund Approved',
        `Your refund of ₹${refund.amount.toFixed(2)} for transaction ${refund.transaction.referenceId} has been approved.`,
        { refundId: refund.id, transactionId: refund.transactionId },
      );

      return saved;
    });
  }

  // 3. Reject a refund
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

    const saved = await this.refundRepository.save(refund);

    // Fire notification to transaction owner
    try {
      const txn = await this.transactionsService.findOne(refund.transactionId);
      await this.notificationsService.create(
        txn.userId,
        NotificationType.REFUND_REJECTED,
        'Refund Rejected',
        `Your refund request of ₹${refund.amount.toFixed(2)} for transaction ${txn.referenceId} has been rejected.`,
        { refundId: refund.id, transactionId: refund.transactionId },
      );
    } catch (err) {
      // Non-critical
    }

    return saved;
  }

  // List all refunds
  async findAll(): Promise<Refund[]> {
    return this.refundRepository.find({
      relations: { transaction: { user: true }, approvedBy: true },
      order: { createdAt: 'DESC' },
    });
  }
}
