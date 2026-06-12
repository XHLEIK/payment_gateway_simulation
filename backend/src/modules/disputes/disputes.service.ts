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
import { Transaction, TransactionStatus, TransactionType } from '../transactions/entities/transaction.entity';
import { TransactionAudit } from '../transactions/entities/transaction-audit.entity';
import { Wallet } from '../wallets/entities/wallet.entity';

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

    if (toStatus === DisputeStatus.RESOLVED) {
      const transaction = dispute.transaction;
      if (!transaction) {
        throw new NotFoundException('Transaction associated with dispute not found');
      }

      if (transaction.status === TransactionStatus.REVERSED || transaction.status === TransactionStatus.REFUNDED) {
        throw new BadRequestException('Transaction is already reversed or refunded');
      }

      if (transaction.type === TransactionType.TRANSFER || transaction.type === TransactionType.TRANSFER_CREDIT) {
        await this.disputeRepository.manager.transaction('SERIALIZABLE', async (manager) => {
          const txnRepo = manager.getRepository(Transaction);
          const walletRepo = manager.getRepository(Wallet);
          const auditRepo = manager.getRepository(TransactionAudit);

          const senderTxn = await txnRepo.findOne({ where: { id: transaction.id } });
          if (!senderTxn) {
            throw new NotFoundException('Transaction not found');
          }

          const receiverTxn = senderTxn.linkedTransactionId
            ? await txnRepo.findOne({ where: { id: senderTxn.linkedTransactionId } })
            : await txnRepo.findOne({ where: { requestId: senderTxn.requestId.endsWith('-rcv') ? senderTxn.requestId : senderTxn.requestId + '-rcv' } });

          if (!receiverTxn) {
            throw new NotFoundException('Linked receiver transaction not found');
          }

          const senderId = senderTxn.userId;
          const receiverId = receiverTxn.userId;
          const amount = senderTxn.amount;

          const sortedUserIds = [senderId, receiverId].sort();
          const walletA = await walletRepo.findOne({
            where: { userId: sortedUserIds[0] },
            lock: { mode: 'pessimistic_write' },
          });
          const walletB = await walletRepo.findOne({
            where: { userId: sortedUserIds[1] },
            lock: { mode: 'pessimistic_write' },
          });

          if (!walletA || !walletB) {
            throw new NotFoundException('One or more wallets not found');
          }

          const senderWallet = walletA.userId === senderId ? walletA : walletB;
          const receiverWallet = walletA.userId === receiverId ? walletA : walletB;

          if (receiverWallet.balance < amount) {
            throw new BadRequestException(
              `Receiver has insufficient balance (₹${receiverWallet.balance}) for reversal of ₹${amount}`,
            );
          }

          receiverWallet.balance = parseFloat((Number(receiverWallet.balance) - amount).toFixed(2));
          senderWallet.balance = parseFloat((Number(senderWallet.balance) + amount).toFixed(2));

          await walletRepo.save(receiverWallet);
          await walletRepo.save(senderWallet);

          senderTxn.status = TransactionStatus.REVERSED;
          senderTxn.balanceAfter = senderWallet.balance;
          receiverTxn.status = TransactionStatus.REVERSED;
          receiverTxn.balanceAfter = receiverWallet.balance;

          await txnRepo.save(senderTxn);
          await txnRepo.save(receiverTxn);

          for (const txn of [senderTxn, receiverTxn]) {
            const audit = auditRepo.create({
              transactionId: txn.id,
              fromStatus: TransactionStatus.SUCCESS,
              toStatus: TransactionStatus.REVERSED,
              actor: `admin:${adminId}`,
            } as any);
            await auditRepo.save(audit);
          }
        });
      } else if (transaction.type === TransactionType.DEBIT || transaction.type === TransactionType.PAYMENT) {
        await this.disputeRepository.manager.transaction('SERIALIZABLE', async (manager) => {
          const txnRepo = manager.getRepository(Transaction);
          const walletRepo = manager.getRepository(Wallet);
          const auditRepo = manager.getRepository(TransactionAudit);

          const txn = await txnRepo.findOne({ where: { id: transaction.id } });
          if (!txn) {
            throw new NotFoundException('Transaction not found');
          }

          const wallet = await walletRepo.findOne({
            where: { userId: txn.userId },
            lock: { mode: 'pessimistic_write' },
          });
          if (!wallet) {
            throw new NotFoundException('Wallet not found');
          }

          wallet.balance = parseFloat((Number(wallet.balance) + txn.amount).toFixed(2));
          await walletRepo.save(wallet);

          txn.status = TransactionStatus.REFUNDED;
          txn.balanceAfter = wallet.balance;
          await txnRepo.save(txn);

          const audit = auditRepo.create({
            transactionId: txn.id,
            fromStatus: TransactionStatus.SUCCESS,
            toStatus: TransactionStatus.REFUNDED,
            actor: `admin:${adminId}`,
          } as any);
          await auditRepo.save(audit);
        });
      }
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
