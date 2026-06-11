import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { Transaction, TransactionStatus, TransactionType } from './entities/transaction.entity';
import { TransactionAudit } from './entities/transaction-audit.entity';
import { WalletsService } from '../wallets/wallets.service';
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

  // Transition Validator Service (Task 1 + senior improvement)
  private validateTransition(from: TransactionStatus, to: TransactionStatus) {
    const allowedTransitions: Record<TransactionStatus, TransactionStatus[]> = {
      [TransactionStatus.INITIATED]: [TransactionStatus.PROCESSING, TransactionStatus.FAILED],
      [TransactionStatus.PROCESSING]: [TransactionStatus.SUCCESS, TransactionStatus.FAILED],
      [TransactionStatus.SUCCESS]: [TransactionStatus.REFUNDED],
      [TransactionStatus.FAILED]: [],
      [TransactionStatus.REFUNDED]: [],
    };

    const targets = allowedTransitions[from] || [];
    if (!targets.includes(to)) {
      throw new BadRequestException(
        `Invalid state transition: Cannot change transaction status from ${from} to ${to}`,
      );
    }
  }
}
