import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, Brackets } from 'typeorm';
import { Transaction, TransactionStatus, TransactionType } from './entities/transaction.entity';
import { TransactionAudit } from './entities/transaction-audit.entity';
import { WalletsService } from '../wallets/wallets.service';
import { Wallet } from '../wallets/entities/wallet.entity';
import { randomBytes } from 'crypto';

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(TransactionAudit)
    private readonly auditRepository: Repository<TransactionAudit>,
    private readonly walletsService: WalletsService,
    private readonly dataSource: DataSource,
  ) {}

  // 1. Initiate Transaction (with Idempotency check)
  async initiate(
    userId: string,
    amount: number,
    type: TransactionType,
    requestId: string,
  ): Promise<Transaction> {
    if (amount <= 0) {
      throw new BadRequestException('Transaction amount must be greater than zero');
    }

    // Check Idempotency
    const existing = await this.transactionRepository.findOne({
      where: { requestId },
    });
    if (existing) {
      this.logger.log(`Duplicate request detected for key: ${requestId}. Returning existing transaction.`);
      return existing;
    }

    // Quick preliminary check for DEBIT
    if (type === TransactionType.DEBIT) {
      const balance = await this.walletsService.getBalance(userId);
      if (balance < amount) {
        throw new BadRequestException('Insufficient wallet balance');
      }
    }

    const referenceId = `TXN-${randomBytes(4).toString('hex').toUpperCase()}`;

    // Create initiated transaction
    const transaction = this.transactionRepository.create({
      referenceId,
      userId,
      amount,
      type,
      status: TransactionStatus.INITIATED,
      requestId,
    });

    const savedTxn = await this.transactionRepository.save(transaction);

    // Create Audit Log
    const audit = this.auditRepository.create({
      transactionId: savedTxn.id,
      fromStatus: null,
      toStatus: TransactionStatus.INITIATED,
      actor: 'user',
    } as any);
    await this.auditRepository.save(audit);

    return savedTxn;
  }

  // 2. State Machine Transitions under SERIALIZABLE Isolation
  async transitionStatus(
    transactionId: string,
    toStatus: TransactionStatus,
    gatewayPaymentId?: string,
    actor: string = 'system',
    correlationId?: string,
    manager?: EntityManager, // optional manager for outer transactions
  ): Promise<Transaction> {
    const executeTransition = async (txnManager: EntityManager) => {
      const txnRepo = txnManager.getRepository(Transaction);
      const auditRepo = txnManager.getRepository(TransactionAudit);

      // Lock row/load transaction under serializable level
      const txn = await txnRepo.findOne({
        where: { id: transactionId },
      });

      if (!txn) {
        throw new NotFoundException(`Transaction ${transactionId} not found`);
      }

      const fromStatus = txn.status;

      // Validate Transition
      this.validateTransition(fromStatus, toStatus);

      // Apply transition updates
      txn.status = toStatus;
      if (gatewayPaymentId) {
        txn.gatewayPaymentId = gatewayPaymentId;
      }

      // Handle wallet balance changes if transitioning to SUCCESS or REFUNDED
      let updatedWallet;
      if (toStatus === TransactionStatus.SUCCESS) {
        if (txn.type === TransactionType.CREDIT) {
          // Add funds to wallet (e.g. from gateway credit)
          updatedWallet = await this.walletsService.credit(txn.userId, txn.amount, txnManager);
        } else if (txn.type === TransactionType.DEBIT) {
          // Spend funds from wallet
          updatedWallet = await this.walletsService.debit(txn.userId, txn.amount, txnManager);
        }
      } else if (toStatus === TransactionStatus.REFUNDED) {
        // Refunding a credit (funds load) -> deduct balance from user's wallet
        // Refunding a debit (payment out) -> return balance to user's wallet
        if (txn.type === TransactionType.CREDIT) {
          updatedWallet = await this.walletsService.debit(txn.userId, txn.amount, txnManager);
        } else if (txn.type === TransactionType.DEBIT) {
          updatedWallet = await this.walletsService.credit(txn.userId, txn.amount, txnManager);
        }
      }

      if (updatedWallet) {
        txn.balanceAfter = updatedWallet.balance;
      }

      const updatedTxn = await txnRepo.save(txn);

      // Log to Audit Trail
      const audit = auditRepo.create({
        transactionId: txn.id,
        fromStatus,
        toStatus,
        actor,
        correlationId,
      } as any);
      await auditRepo.save(audit);

      return updatedTxn;
    };

    // Run inside SERIALIZABLE transaction block
    if (manager) {
      return executeTransition(manager);
    } else {
      return this.dataSource.transaction('SERIALIZABLE', async (txnManager) => {
        return executeTransition(txnManager);
      });
    }
  }

  // ============================================================
  //  P2P TRANSFER REVERSAL SYSTEM
  // ============================================================

  /**
   * Request a reversal for a P2P transfer. Only the sender (TXN-SND-*) can request.
   * Finds the linked receiver transaction and marks both as REVERSAL_PENDING.
   */
  async requestReversal(
    transactionId: string,
    userId: string,
    reason: string,
  ): Promise<{ senderTxn: Transaction; receiverTxn: Transaction }> {
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const txnRepo = manager.getRepository(Transaction);
      const auditRepo = manager.getRepository(TransactionAudit);

      const senderTxn = await txnRepo.findOne({ where: { id: transactionId } });
      if (!senderTxn) {
        throw new NotFoundException(`Transaction ${transactionId} not found`);
      }

      // Only sender can request reversal
      if (senderTxn.userId !== userId) {
        throw new BadRequestException('You can only request reversals for your own transactions');
      }

      // Must be a successful TRANSFER sent by this user
      if (senderTxn.type !== TransactionType.TRANSFER) {
        throw new BadRequestException('Reversals are only available for P2P transfers');
      }

      if (!senderTxn.referenceId.startsWith('TXN-SND-')) {
        throw new BadRequestException('Reversals can only be requested by the sender');
      }

      if (senderTxn.status !== TransactionStatus.SUCCESS) {
        throw new BadRequestException(
          `Transaction must be in SUCCESS state for reversal. Current: ${senderTxn.status}`,
        );
      }

      // Find the linked receiver transaction by requestId pattern
      const receiverRequestId = senderTxn.requestId + '-rcv';
      const receiverTxn = await txnRepo.findOne({
        where: { requestId: receiverRequestId },
      });

      if (!receiverTxn) {
        throw new NotFoundException('Linked receiver transaction not found');
      }

      // Check if receiver transaction is also SUCCESS
      if (receiverTxn.status !== TransactionStatus.SUCCESS) {
        throw new BadRequestException(
          `Receiver transaction must be in SUCCESS state. Current: ${receiverTxn.status}`,
        );
      }

      // Transition both to REVERSAL_PENDING
      senderTxn.status = TransactionStatus.REVERSAL_PENDING;
      senderTxn.reversalReason = reason;
      senderTxn.linkedTransactionId = receiverTxn.id;

      receiverTxn.status = TransactionStatus.REVERSAL_PENDING;
      receiverTxn.reversalReason = reason;
      receiverTxn.linkedTransactionId = senderTxn.id;

      await txnRepo.save(senderTxn);
      await txnRepo.save(receiverTxn);

      // Audit logs
      for (const txn of [senderTxn, receiverTxn]) {
        const audit = auditRepo.create({
          transactionId: txn.id,
          fromStatus: TransactionStatus.SUCCESS,
          toStatus: TransactionStatus.REVERSAL_PENDING,
          actor: 'user',
        } as any);
        await auditRepo.save(audit);
      }

      this.logger.log(`Reversal requested for transactions ${senderTxn.id} / ${receiverTxn.id}`);

      return { senderTxn, receiverTxn };
    });
  }

  /**
   * Admin approves reversal: atomically debits receiver's wallet and credits sender's wallet.
   * Uses sorted-key deadlock prevention (same pattern as sendMoney).
   */
  async approveReversal(
    transactionId: string,
    adminId: string,
  ): Promise<{ senderTxn: Transaction; receiverTxn: Transaction }> {
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const txnRepo = manager.getRepository(Transaction);
      const auditRepo = manager.getRepository(TransactionAudit);

      const senderTxn = await txnRepo.findOne({ where: { id: transactionId } });
      if (!senderTxn) {
        throw new NotFoundException(`Transaction ${transactionId} not found`);
      }

      if (senderTxn.status !== TransactionStatus.REVERSAL_PENDING) {
        throw new BadRequestException(`Transaction must be in REVERSAL_PENDING state. Current: ${senderTxn.status}`);
      }

      if (!senderTxn.referenceId.startsWith('TXN-SND-')) {
        throw new BadRequestException('Must approve reversal using the sender transaction ID');
      }

      if (!senderTxn.linkedTransactionId) {
        throw new BadRequestException('Linked transaction ID is missing on reversal request');
      }

      // Find linked receiver transaction
      const receiverTxn = await txnRepo.findOne({
        where: { id: senderTxn.linkedTransactionId },
      });

      if (!receiverTxn) {
        throw new NotFoundException('Linked receiver transaction not found');
      }

      // Sorted-key deadlock prevention: lock wallets in alphabetical UUID order
      const senderId = senderTxn.userId;
      const receiverId = receiverTxn.userId;
      const amount = senderTxn.amount;

      const sortedUserIds = [senderId, receiverId].sort();

      // Lock wallets in deterministic order to prevent deadlocks
      const walletRepo = manager.getRepository(Wallet);

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

      // Check receiver has sufficient balance for reversal debit
      if (receiverWallet.balance < amount) {
        throw new BadRequestException(
          `Receiver has insufficient balance (₹${receiverWallet.balance}) for reversal of ₹${amount}`,
        );
      }

      // Execute compensating transaction: debit receiver, credit sender
      receiverWallet.balance = parseFloat((Number(receiverWallet.balance) - amount).toFixed(2));
      senderWallet.balance = parseFloat((Number(senderWallet.balance) + amount).toFixed(2));

      await walletRepo.save(receiverWallet);
      await walletRepo.save(senderWallet);

      // Transition both to REVERSED
      senderTxn.status = TransactionStatus.REVERSED;
      senderTxn.balanceAfter = senderWallet.balance;
      receiverTxn.status = TransactionStatus.REVERSED;
      receiverTxn.balanceAfter = receiverWallet.balance;

      await txnRepo.save(senderTxn);
      await txnRepo.save(receiverTxn);

      // Audit logs
      for (const txn of [senderTxn, receiverTxn]) {
        const audit = auditRepo.create({
          transactionId: txn.id,
          fromStatus: TransactionStatus.REVERSAL_PENDING,
          toStatus: TransactionStatus.REVERSED,
          actor: `admin:${adminId}`,
        } as any);
        await auditRepo.save(audit);
      }

      this.logger.log(`Reversal approved for transactions ${senderTxn.id} / ${receiverTxn.id} by admin ${adminId}`);

      return { senderTxn, receiverTxn };
    });
  }

  /**
   * Admin rejects reversal: transitions both transactions back to SUCCESS.
   */
  async rejectReversal(transactionId: string, adminId: string): Promise<Transaction> {
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const txnRepo = manager.getRepository(Transaction);
      const auditRepo = manager.getRepository(TransactionAudit);

      const senderTxn = await txnRepo.findOne({ where: { id: transactionId } });
      if (!senderTxn) {
        throw new NotFoundException(`Transaction ${transactionId} not found`);
      }

      if (senderTxn.status !== TransactionStatus.REVERSAL_PENDING) {
        throw new BadRequestException(`Transaction must be in REVERSAL_PENDING state`);
      }

      // Restore both transactions to SUCCESS
      senderTxn.status = TransactionStatus.SUCCESS;

      const receiverTxn = senderTxn.linkedTransactionId
        ? await txnRepo.findOne({ where: { id: senderTxn.linkedTransactionId } })
        : null;

      if (receiverTxn && receiverTxn.status === TransactionStatus.REVERSAL_PENDING) {
        receiverTxn.status = TransactionStatus.SUCCESS;
        await txnRepo.save(receiverTxn);

        const auditR = auditRepo.create({
          transactionId: receiverTxn.id,
          fromStatus: TransactionStatus.REVERSAL_PENDING,
          toStatus: TransactionStatus.SUCCESS,
          actor: `admin:${adminId}`,
        } as any);
        await auditRepo.save(auditR);
      }

      await txnRepo.save(senderTxn);

      const auditS = auditRepo.create({
        transactionId: senderTxn.id,
        fromStatus: TransactionStatus.REVERSAL_PENDING,
        toStatus: TransactionStatus.SUCCESS,
        actor: `admin:${adminId}`,
      } as any);
      await auditRepo.save(auditS);

      this.logger.log(`Reversal rejected for transaction ${transactionId} by admin ${adminId}`);

      return senderTxn;
    });
  }

  /**
   * Get all pending reversals (admin view).
   */
  async findPendingReversals() {
    return this.transactionRepository.find({
      where: { status: TransactionStatus.REVERSAL_PENDING },
      relations: { user: true },
      order: { updatedAt: 'DESC' },
    });
  }

  // 3. Retrieve and Filter Transactions
  async findAll(filters: {
    userId?: string;
    page: number;
    limit: number;
    status?: TransactionStatus;
    from?: string;
    to?: string;
    type?: TransactionType;
    minAmount?: number;
    maxAmount?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
  }) {
    const {
      userId,
      page = 1,
      limit = 20,
      status,
      from,
      to,
      type,
      minAmount,
      maxAmount,
      search,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = filters;

    const offset = (page - 1) * limit;
    const qb = this.transactionRepository.createQueryBuilder('txn');

    // Load User info for Admin display
    qb.leftJoinAndSelect('txn.user', 'user');

    if (userId) {
      qb.andWhere('txn.userId = :userId', { userId });
      qb.andWhere(
        new Brackets((innerQb) => {
          innerQb.where('txn.type != :tcType', { tcType: TransactionType.TRANSFER_CREDIT })
            .orWhere('txn.status = :successStatus', { successStatus: TransactionStatus.SUCCESS });
        }),
      );
    }

    if (status) {
      qb.andWhere('txn.status = :status', { status });
    }

    if (from) {
      qb.andWhere('txn.createdAt >= :from', { from: new Date(from) });
    }

    if (to) {
      // Set to end of the day
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      qb.andWhere('txn.createdAt <= :to', { to: toDate });
    }

    if (type) {
      qb.andWhere('txn.type = :type', { type });
    }

    if (minAmount !== undefined) {
      qb.andWhere('txn.amount >= :minAmount', { minAmount });
    }

    if (maxAmount !== undefined) {
      qb.andWhere('txn.amount <= :maxAmount', { maxAmount });
    }

    if (search) {
      qb.andWhere(
        '(txn.referenceId ILIKE :search OR txn.gatewayOrderId ILIKE :search OR user.name ILIKE :search OR user.email ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    // Set sorting dynamically
    const validSortFields = ['createdAt', 'amount', 'referenceId', 'status', 'type'];
    const sortField = validSortFields.includes(sortBy) ? `txn.${sortBy}` : 'txn.createdAt';
    const cleanOrder = sortOrder === 'ASC' ? 'ASC' : 'DESC';
    
    qb.orderBy(sortField, cleanOrder)
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

  // 4. Retrieve single transaction details
  async findOne(id: string): Promise<Transaction> {
    const txn = await this.transactionRepository.findOne({
      where: { id },
      relations: { user: true, auditLogs: true, refunds: true },
    });

    if (!txn) {
      throw new NotFoundException(`Transaction with ID ${id} not found`);
    }

    return txn;
  }

  async findByGatewayOrderId(gatewayOrderId: string): Promise<Transaction | null> {
    return this.transactionRepository.findOne({
      where: { gatewayOrderId },
    });
  }

  // ============================================================
  //  PROCESSING TRANSFER MANAGEMENT (Simulation Toggle Feature)
  // ============================================================

  /**
   * Find all PROCESSING transfers for admin queue.
   */
  async findProcessingTransfers() {
    return this.transactionRepository.find({
      where: { status: TransactionStatus.PROCESSING, type: TransactionType.TRANSFER },
      relations: { user: true },
      order: { createdAt: 'DESC' },
    });
  }

  // Transition Validator Service (Extended state machine with reversal states)
  private validateTransition(from: TransactionStatus, to: TransactionStatus) {
    const allowedTransitions: Record<TransactionStatus, TransactionStatus[]> = {
      [TransactionStatus.INITIATED]: [TransactionStatus.PROCESSING, TransactionStatus.FAILED],
      [TransactionStatus.PROCESSING]: [TransactionStatus.SUCCESS, TransactionStatus.FAILED],
      [TransactionStatus.SUCCESS]: [TransactionStatus.REFUNDED, TransactionStatus.REVERSAL_PENDING],
      [TransactionStatus.FAILED]: [],
      [TransactionStatus.REFUNDED]: [],
      [TransactionStatus.REVERSAL_PENDING]: [TransactionStatus.REVERSED, TransactionStatus.SUCCESS],
      [TransactionStatus.REVERSED]: [],
    };

    const targets = allowedTransitions[from] || [];
    if (!targets.includes(to)) {
      throw new BadRequestException(
        `Invalid state transition: Cannot change transaction status from ${from} to ${to}`,
      );
    }
  }
}
