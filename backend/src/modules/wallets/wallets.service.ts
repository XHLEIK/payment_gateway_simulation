import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, DataSource } from 'typeorm';
import { Wallet } from './entities/wallet.entity';
import { DailyLimit } from './entities/daily-limit.entity';
import { Transaction, TransactionStatus, TransactionType } from '../transactions/entities/transaction.entity';
import { UsersService } from '../users/users.service';
import { TransactionAudit } from '../transactions/entities/transaction-audit.entity';
import { RedisService } from '../redis/redis.service';
import { randomBytes } from 'crypto';

@Injectable()
export class WalletsService {
  private readonly logger = new Logger(WalletsService.name);
  private readonly DAILY_SPEND_PREFIX = 'daily_spend';

  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(DailyLimit)
    private readonly dailyLimitRepository: Repository<DailyLimit>,
    private readonly usersService: UsersService,
    private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
  ) {}

  async getBalance(userId: string): Promise<number> {
    const wallet = await this.walletRepository.findOne({ where: { userId } });
    if (!wallet) {
      throw new NotFoundException(`Wallet not found for user ${userId}`);
    }
    return wallet.balance;
  }

  async credit(userId: string, amount: number, manager: EntityManager): Promise<Wallet> {
    if (amount <= 0) {
      throw new BadRequestException('Credit amount must be positive');
    }

    // SELECT FOR UPDATE locking
    const wallet = await manager.getRepository(Wallet).findOne({
      where: { userId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!wallet) {
      throw new NotFoundException(`Wallet not found for user ${userId}`);
    }

    wallet.balance = parseFloat((Number(wallet.balance) + amount).toFixed(2));
    return manager.getRepository(Wallet).save(wallet);
  }

  async debit(userId: string, amount: number, manager: EntityManager): Promise<Wallet> {
    if (amount <= 0) {
      throw new BadRequestException('Debit amount must be positive');
    }

    // SELECT FOR UPDATE locking
    const wallet = await manager.getRepository(Wallet).findOne({
      where: { userId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!wallet) {
      throw new NotFoundException(`Wallet not found for user ${userId}`);
    }

    if (wallet.balance < amount) {
      throw new BadRequestException('Insufficient wallet balance');
    }

    wallet.balance = parseFloat((Number(wallet.balance) - amount).toFixed(2));
    return manager.getRepository(Wallet).save(wallet);
  }

  // ============================================================
  //  DAILY TRANSACTION LIMIT — Redis Sliding Window (O(1))
  // ============================================================

  /**
   * Check if a user's daily spending + proposed amount exceeds their limit.
   * Uses Redis sliding window with DB fallback for resilience.
   */
  async checkDailyLimit(userId: string, amount: number): Promise<void> {
    const limit = await this.getDailyLimit(userId);
    const todayStr = new Date().toISOString().split('T')[0];
    const key = `${this.DAILY_SPEND_PREFIX}:${userId}:${todayStr}`;

    let todaySpent = 0;

    // Try Redis O(1) lookup first
    try {
      const cached = await this.redisService.get(key);
      if (cached !== null) {
        todaySpent = parseFloat(cached);
      } else {
        // Fallback: aggregate from DB (prefix sum over today's successful debits)
        todaySpent = await this.calculateTodaySpend(userId, todayStr);
        // Seed Redis for future O(1) reads
        await this.redisService.set(key, String(todaySpent), this.secondsUntilMidnight());
      }
    } catch (err) {
      this.logger.warn(`Redis daily limit check failed, falling back to DB for user ${userId}`);
      todaySpent = await this.calculateTodaySpend(userId, todayStr);
    }

    if (todaySpent + amount > limit) {
      const remaining = Math.max(0, limit - todaySpent);
      throw new BadRequestException(
        `Daily transaction limit exceeded. Limit: ₹${limit.toFixed(2)}, Spent today: ₹${todaySpent.toFixed(2)}, Remaining: ₹${remaining.toFixed(2)}`,
      );
    }
  }

  /**
   * After a successful debit/transfer, update the Redis sliding window counter.
   */
  async incrementDailySpend(userId: string, amount: number): Promise<void> {
    const todayStr = new Date().toISOString().split('T')[0];
    const key = `${this.DAILY_SPEND_PREFIX}:${userId}:${todayStr}`;

    try {
      const client = this.redisService.getClient();
      await client.incrbyfloat(key, amount);
      // Set TTL to expire at midnight
      await client.expire(key, this.secondsUntilMidnight());
    } catch (err) {
      this.logger.warn(`Failed to increment daily spend in Redis for user ${userId}`);
    }
  }

  /**
   * Get a user's daily limit (default: ₹50,000).
   */
  async getDailyLimit(userId: string): Promise<number> {
    const record = await this.dailyLimitRepository.findOne({ where: { userId } });
    return record ? record.dailyLimit : 50000.00;
  }

  /**
   * Admin: set a user's daily limit.
   */
  async setDailyLimit(userId: string, limit: number): Promise<DailyLimit> {
    if (limit <= 0) {
      throw new BadRequestException('Daily limit must be positive');
    }

    let record = await this.dailyLimitRepository.findOne({ where: { userId } });
    if (record) {
      record.dailyLimit = limit;
    } else {
      record = this.dailyLimitRepository.create({ userId, dailyLimit: limit });
    }
    return this.dailyLimitRepository.save(record);
  }

  /**
   * Get today's spending summary for a user.
   */
  async getDailySpendSummary(userId: string): Promise<{
    limit: number;
    spent: number;
    remaining: number;
  }> {
    const limit = await this.getDailyLimit(userId);
    const todayStr = new Date().toISOString().split('T')[0];
    
    let spent = 0;
    try {
      const key = `${this.DAILY_SPEND_PREFIX}:${userId}:${todayStr}`;
      const cached = await this.redisService.get(key);
      spent = cached !== null ? parseFloat(cached) : await this.calculateTodaySpend(userId, todayStr);
    } catch {
      spent = await this.calculateTodaySpend(userId, todayStr);
    }

    return {
      limit,
      spent: parseFloat(spent.toFixed(2)),
      remaining: parseFloat(Math.max(0, limit - spent).toFixed(2)),
    };
  }

  /** DB fallback: sum today's successful outgoing transactions */
  private async calculateTodaySpend(userId: string, todayStr: string): Promise<number> {
    const startOfDay = new Date(todayStr + 'T00:00:00.000Z');
    const endOfDay = new Date(todayStr + 'T23:59:59.999Z');

    const result = await this.transactionRepository
      .createQueryBuilder('txn')
      .select('COALESCE(SUM(txn.amount), 0)', 'total')
      .where('txn.userId = :userId', { userId })
      .andWhere('txn.status = :status', { status: TransactionStatus.SUCCESS })
      .andWhere('txn.type IN (:...types)', { types: [TransactionType.DEBIT, TransactionType.TRANSFER] })
      .andWhere('txn.referenceId LIKE :prefix', { prefix: 'TXN-SND-%' })
      .andWhere('txn.createdAt >= :start', { start: startOfDay })
      .andWhere('txn.createdAt <= :end', { end: endOfDay })
      .getRawOne();

    return parseFloat(result?.total || '0');
  }

  /** Seconds until midnight UTC */
  private secondsUntilMidnight(): number {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setUTCHours(24, 0, 0, 0);
    return Math.max(1, Math.floor((midnight.getTime() - now.getTime()) / 1000));
  }

  // ============================================================
  //  SEND MONEY — with Simulation Toggles
  // ============================================================

  async sendMoney(
    senderId: string,
    recipientEmail: string,
    amount: number,
    pin: string,
    requestId: string,
    simulateFailure: boolean = false,
    simulateProcessing: boolean = false,
  ): Promise<any> {
    if (amount <= 0) {
      throw new BadRequestException('Transfer amount must be greater than zero');
    }

    // 1. Verify PIN
    await this.usersService.verifyPin(senderId, pin);

    // 2. Find recipient
    const recipient = await this.usersService.findByEmail(recipientEmail);
    if (!recipient) {
      throw new NotFoundException('Recipient candidate does not exist');
    }

    if (senderId === recipient.id) {
      throw new BadRequestException('Cannot transfer money to yourself');
    }

    // 3. Check Idempotency for this sender request
    const existing = await this.transactionRepository.findOne({
      where: { requestId, userId: senderId },
    });
    if (existing) {
      return {
        message: 'Duplicate transaction request key',
        referenceId: existing.referenceId,
        amount: existing.amount,
        status: existing.status,
        balance: await this.getBalance(senderId),
      };
    }

    // 4. Check daily transaction limit before proceeding
    await this.checkDailyLimit(senderId, amount);

    // 5. Perform direct transfer inside SERIALIZABLE transaction block
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const walletRepo = manager.getRepository(Wallet);
      const transactionRepo = manager.getRepository(Transaction);
      const auditRepo = manager.getRepository(TransactionAudit);

      // Generate unique transaction references for audit trail separation
      const refIdSender = `TXN-SND-${randomBytes(4).toString('hex').toUpperCase()}`;
      const refIdRecipient = `TXN-RCV-${randomBytes(4).toString('hex').toUpperCase()}`;

      // ---- SIMULATE FAILED PAYMENT ----
      if (simulateFailure) {
        const senderTxn = transactionRepo.create({
          referenceId: refIdSender,
          userId: senderId,
          amount,
          type: TransactionType.TRANSFER,
          status: TransactionStatus.FAILED,
          requestId,
          linkedTransactionId: null,
        });
        const savedSenderTxn = await transactionRepo.save(senderTxn);

        const recipientTxn = transactionRepo.create({
          referenceId: refIdRecipient,
          userId: recipient.id,
          amount,
          type: TransactionType.TRANSFER_CREDIT,
          status: TransactionStatus.FAILED,
          requestId: `${requestId}-rcv`,
          linkedTransactionId: savedSenderTxn.id,
        });
        await transactionRepo.save(recipientTxn);

        // Update sender's linked ID
        savedSenderTxn.linkedTransactionId = recipientTxn.id;
        await transactionRepo.save(savedSenderTxn);

        const audit = auditRepo.create({
          transactionId: savedSenderTxn.id,
          fromStatus: null,
          toStatus: TransactionStatus.FAILED,
          actor: 'simulation',
        } as any);
        await auditRepo.save(audit);

        return {
          message: 'Simulated: Payment failed (no funds were moved)',
          referenceId: refIdSender,
          amount,
          status: TransactionStatus.FAILED,
          balance: await this.getBalance(senderId),
          simulated: true,
        };
      }

      // ---- SIMULATE PROCESSING ----
      if (simulateProcessing) {
        const senderTxn = transactionRepo.create({
          referenceId: refIdSender,
          userId: senderId,
          amount,
          type: TransactionType.TRANSFER,
          status: TransactionStatus.PROCESSING,
          requestId,
          linkedTransactionId: null,
        });
        const savedSenderTxn = await transactionRepo.save(senderTxn);

        const recipientTxn = transactionRepo.create({
          referenceId: refIdRecipient,
          userId: recipient.id,
          amount,
          type: TransactionType.TRANSFER_CREDIT,
          status: TransactionStatus.PROCESSING,
          requestId: `${requestId}-rcv`,
          linkedTransactionId: savedSenderTxn.id,
        });
        const savedRecipientTxn = await transactionRepo.save(recipientTxn);

        savedSenderTxn.linkedTransactionId = savedRecipientTxn.id;
        await transactionRepo.save(savedSenderTxn);

        const audit = auditRepo.create({
          transactionId: savedSenderTxn.id,
          fromStatus: null,
          toStatus: TransactionStatus.PROCESSING,
          actor: 'simulation',
        } as any);
        await auditRepo.save(audit);

        return {
          message: 'Simulated: Payment is processing. Awaiting admin approval.',
          referenceId: refIdSender,
          amount,
          status: TransactionStatus.PROCESSING,
          balance: await this.getBalance(senderId),
          simulated: true,
        };
      }

      // ---- NORMAL TRANSFER (existing logic) ----

      // Lock order: sort userIds alphabetically to prevent transfer deadlocks
      const sortedUserIds = [senderId, recipient.id].sort();

      // Acquire locks in order
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

      // Map locked rows
      const senderWallet = walletA.userId === senderId ? walletA : walletB;
      const recipientWallet = walletA.userId === recipient.id ? walletA : walletB;

      // Check balance
      if (senderWallet.balance < amount) {
        throw new BadRequestException('Insufficient wallet balance');
      }

      // Perform updates
      senderWallet.balance = parseFloat((Number(senderWallet.balance) - amount).toFixed(2));
      recipientWallet.balance = parseFloat((Number(recipientWallet.balance) + amount).toFixed(2));

      await walletRepo.save(senderWallet);
      await walletRepo.save(recipientWallet);

      // Create sender DEBIT transaction
      const senderTxn = transactionRepo.create({
        referenceId: refIdSender,
        userId: senderId,
        amount,
        type: TransactionType.TRANSFER,
        status: TransactionStatus.SUCCESS,
        requestId,
        balanceAfter: senderWallet.balance,
      });
      const savedSenderTxn = await transactionRepo.save(senderTxn);

      // Create recipient CREDIT transaction
      const recipientTxn = transactionRepo.create({
        referenceId: refIdRecipient,
        userId: recipient.id,
        amount,
        type: TransactionType.TRANSFER_CREDIT,
        status: TransactionStatus.SUCCESS,
        requestId: `${requestId}-rcv`,
        balanceAfter: recipientWallet.balance,
        linkedTransactionId: savedSenderTxn.id,
      });
      const savedRecipientTxn = await transactionRepo.save(recipientTxn);

      // Link sender to receiver
      savedSenderTxn.linkedTransactionId = savedRecipientTxn.id;
      await transactionRepo.save(savedSenderTxn);

      // Log audit records
      const auditSender = auditRepo.create({
        transactionId: savedSenderTxn.id,
        fromStatus: null,
        toStatus: TransactionStatus.SUCCESS,
        actor: 'user',
      } as any);
      await auditRepo.save(auditSender);

      // Update Redis daily spend counter
      await this.incrementDailySpend(senderId, amount);

      return {
        message: 'Funds transferred successfully',
        referenceId: refIdSender,
        amount,
        balance: senderWallet.balance,
      };
    });
  }

  // ============================================================
  //  PROCESSING TRANSFER APPROVAL (Admin)
  // ============================================================

  /**
   * Admin approves a PROCESSING transfer: executes actual wallet operations.
   */
  async approveProcessingTransfer(transactionId: string, adminId: string): Promise<any> {
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const txnRepo = manager.getRepository(Transaction);
      const walletRepo = manager.getRepository(Wallet);
      const auditRepo = manager.getRepository(TransactionAudit);

      const senderTxn = await txnRepo.findOne({ where: { id: transactionId } });
      if (!senderTxn) {
        throw new NotFoundException(`Transaction ${transactionId} not found`);
      }

      if (senderTxn.status !== TransactionStatus.PROCESSING) {
        throw new BadRequestException(`Transaction must be in PROCESSING state. Current: ${senderTxn.status}`);
      }

      if (senderTxn.type !== TransactionType.TRANSFER) {
        throw new BadRequestException('Only TRANSFER transactions can be approved from processing queue');
      }

      // Find linked receiver transaction
      const receiverTxn = senderTxn.linkedTransactionId
        ? await txnRepo.findOne({ where: { id: senderTxn.linkedTransactionId } })
        : await txnRepo.findOne({ where: { requestId: senderTxn.requestId + '-rcv' } });

      if (!receiverTxn) {
        throw new NotFoundException('Linked receiver transaction not found');
      }

      const senderId = senderTxn.userId;
      const receiverId = receiverTxn.userId;
      const amount = senderTxn.amount;

      // Sorted-key lock to prevent deadlocks
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

      if (senderWallet.balance < amount) {
        throw new BadRequestException(`Sender has insufficient balance (₹${senderWallet.balance}) for ₹${amount}`);
      }

      // Execute wallet operations
      senderWallet.balance = parseFloat((Number(senderWallet.balance) - amount).toFixed(2));
      receiverWallet.balance = parseFloat((Number(receiverWallet.balance) + amount).toFixed(2));

      await walletRepo.save(senderWallet);
      await walletRepo.save(receiverWallet);

      // Transition to SUCCESS
      senderTxn.status = TransactionStatus.SUCCESS;
      senderTxn.balanceAfter = senderWallet.balance;
      receiverTxn.status = TransactionStatus.SUCCESS;
      receiverTxn.balanceAfter = receiverWallet.balance;

      await txnRepo.save(senderTxn);
      await txnRepo.save(receiverTxn);

      // Audit logs
      for (const txn of [senderTxn, receiverTxn]) {
        const audit = auditRepo.create({
          transactionId: txn.id,
          fromStatus: TransactionStatus.PROCESSING,
          toStatus: TransactionStatus.SUCCESS,
          actor: `admin:${adminId}`,
        } as any);
        await auditRepo.save(audit);
      }

      // Update daily spend
      await this.incrementDailySpend(senderId, amount);

      this.logger.log(`Processing transfer ${transactionId} approved by admin ${adminId}`);

      return {
        message: 'Processing transfer approved. Funds transferred successfully.',
        senderBalance: senderWallet.balance,
        receiverBalance: receiverWallet.balance,
      };
    });
  }

  /**
   * Admin rejects a PROCESSING transfer: marks both as FAILED.
   */
  async rejectProcessingTransfer(transactionId: string, adminId: string): Promise<any> {
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const txnRepo = manager.getRepository(Transaction);
      const auditRepo = manager.getRepository(TransactionAudit);

      const senderTxn = await txnRepo.findOne({ where: { id: transactionId } });
      if (!senderTxn) {
        throw new NotFoundException(`Transaction ${transactionId} not found`);
      }

      if (senderTxn.status !== TransactionStatus.PROCESSING) {
        throw new BadRequestException(`Transaction must be in PROCESSING state`);
      }

      const receiverTxn = senderTxn.linkedTransactionId
        ? await txnRepo.findOne({ where: { id: senderTxn.linkedTransactionId } })
        : await txnRepo.findOne({ where: { requestId: senderTxn.requestId + '-rcv' } });

      // Mark both as FAILED
      senderTxn.status = TransactionStatus.FAILED;
      await txnRepo.save(senderTxn);

      if (receiverTxn) {
        receiverTxn.status = TransactionStatus.FAILED;
        await txnRepo.save(receiverTxn);
      }

      // Audit logs
      const audit = auditRepo.create({
        transactionId: senderTxn.id,
        fromStatus: TransactionStatus.PROCESSING,
        toStatus: TransactionStatus.FAILED,
        actor: `admin:${adminId}`,
      } as any);
      await auditRepo.save(audit);

      this.logger.log(`Processing transfer ${transactionId} rejected by admin ${adminId}`);

      return { message: 'Processing transfer rejected. No funds were moved.' };
    });
  }

  async getHistory(userId: string): Promise<any[]> {
    const txs = await this.transactionRepository.find({
      where: [
        { userId, status: TransactionStatus.SUCCESS },
        { userId, status: TransactionStatus.REFUNDED },
        { userId, status: TransactionStatus.REVERSED },
        { userId, status: TransactionStatus.REVERSAL_PENDING },
        { userId, status: TransactionStatus.FAILED },
        { userId, status: TransactionStatus.PROCESSING },
      ],
      order: { createdAt: 'DESC' },
    });

    return txs
      .filter((tx) => !(tx.type === TransactionType.TRANSFER_CREDIT && tx.status !== TransactionStatus.SUCCESS))
      .map((tx) => {
        let typeLabel = tx.type;
        if (tx.type === TransactionType.TRANSFER) {
          typeLabel = tx.referenceId.startsWith('TXN-SND-') 
            ? 'TRANSFER_OUT' as any 
            : 'TRANSFER_IN' as any;
        } else if (tx.type === TransactionType.TRANSFER_CREDIT) {
          typeLabel = 'TRANSFER_IN' as any;
        }
        return {
          id: tx.id,
          referenceId: tx.referenceId,
          type: typeLabel,
          amount: tx.amount,
          balanceAfter: tx.balanceAfter,
          status: tx.status,
          reversalReason: tx.reversalReason,
          linkedTransactionId: tx.linkedTransactionId,
          createdAt: tx.createdAt,
        };
      });
  }
}
