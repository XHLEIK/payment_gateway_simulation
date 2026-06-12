import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Dispute, DisputeStatus } from './entities/dispute.entity';
import { TransactionsService } from '../transactions/transactions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';

@Injectable()
export class DisputesService {
  private readonly logger = new Logger(DisputesService.name);

  // Adjacency-list FSM for O(1) transition validation
  private readonly allowedTransitions: Record<DisputeStatus, DisputeStatus[]> = {
    [DisputeStatus.OPEN]: [DisputeStatus.UNDER_REVIEW, DisputeStatus.REJECTED],
    [DisputeStatus.UNDER_REVIEW]: [DisputeStatus.RESOLVED, DisputeStatus.REJECTED],
    [DisputeStatus.RESOLVED]: [],
    [DisputeStatus.REJECTED]: [],
  };

  constructor(
    @InjectRepository(Dispute)
    private readonly disputeRepository: Repository<Dispute>,
    private readonly transactionsService: TransactionsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Create a dispute. Enforces compound uniqueness (one dispute per user per transaction).
   */
  async create(
    userId: string,
    transactionId: string,
    reason: string,
    evidence?: string,
  ): Promise<Dispute> {
    // Validate transaction exists
    const transaction = await this.transactionsService.findOne(transactionId);

    // Check for existing open/under-review dispute by this user
    const existing = await this.disputeRepository.findOne({
      where: { transactionId, userId },
    });

    if (existing && (existing.status === DisputeStatus.OPEN || existing.status === DisputeStatus.UNDER_REVIEW)) {
      throw new BadRequestException(
        `You already have an active dispute (${existing.status}) for this transaction`,
      );
    }

    if (existing) {
      throw new BadRequestException(
        'You have already filed a dispute for this transaction',
      );
    }

    const dispute = this.disputeRepository.create({
      transactionId,
      userId,
      reason,
      evidence: evidence || null,
      status: DisputeStatus.OPEN,
    });

    const saved = await this.disputeRepository.save(dispute);

    this.logger.log(`Dispute ${saved.id} created by user ${userId} for transaction ${transactionId}`);

    return saved;
  }

  /**
   * Find all disputes. Admin sees all, user sees own.
   */
  async findAll(filters: {
    userId?: string;
    isAdmin: boolean;
    status?: DisputeStatus;
    page?: number;
    limit?: number;
  }) {
    const { userId, isAdmin, status, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    const qb = this.disputeRepository.createQueryBuilder('d')
      .leftJoinAndSelect('d.transaction', 'txn')
      .leftJoinAndSelect('d.user', 'user')
      .leftJoinAndSelect('d.resolvedBy', 'resolver');

    if (!isAdmin && userId) {
      qb.andWhere('d.userId = :userId', { userId });
    }

    if (status) {
      qb.andWhere('d.status = :status', { status });
    }

    qb.orderBy('d.createdAt', 'DESC')
      .skip(offset)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Update dispute status with O(1) FSM validation.
   */
  async updateStatus(
    disputeId: string,
    toStatus: DisputeStatus,
    adminId: string,
    adminNotes?: string,
  ): Promise<Dispute> {
    const dispute = await this.disputeRepository.findOne({
      where: { id: disputeId },
      relations: { transaction: true },
    });

    if (!dispute) {
      throw new NotFoundException(`Dispute ${disputeId} not found`);
    }

    // O(1) transition validation
    const allowed = this.allowedTransitions[dispute.status] || [];
    if (!allowed.includes(toStatus)) {
      throw new BadRequestException(
        `Invalid dispute transition: ${dispute.status} → ${toStatus}`,
      );
    }

    dispute.status = toStatus;
    dispute.resolvedById = adminId;
    if (adminNotes) {
      dispute.adminNotes = adminNotes;
    }

    const updated = await this.disputeRepository.save(dispute);

    // Fire notification to dispute creator
    await this.notificationsService.create(
      dispute.userId,
      NotificationType.DISPUTE_UPDATED,
      `Dispute ${toStatus === DisputeStatus.RESOLVED ? 'Resolved' : toStatus === DisputeStatus.REJECTED ? 'Rejected' : 'Under Review'}`,
      `Your dispute for transaction ${dispute.transaction?.referenceId || dispute.transactionId} has been updated to ${toStatus}.${adminNotes ? ' Admin notes: ' + adminNotes : ''}`,
      { disputeId: dispute.id, transactionId: dispute.transactionId },
    );

    this.logger.log(`Dispute ${disputeId} transitioned to ${toStatus} by admin ${adminId}`);

    return updated;
  }
}
