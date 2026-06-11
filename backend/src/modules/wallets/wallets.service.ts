import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, DataSource } from 'typeorm';
import { Wallet } from './entities/wallet.entity';
import { Transaction, TransactionStatus, TransactionType } from '../transactions/entities/transaction.entity';
import { UsersService } from '../users/users.service';
import { TransactionAudit } from '../transactions/entities/transaction-audit.entity';
import { randomBytes } from 'crypto';

@Injectable()
export class WalletsService {
  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly usersService: UsersService,
    private readonly dataSource: DataSource,
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

  async sendMoney(
    senderId: string,
    recipientEmail: string,
    amount: number,
    pin: string,
    requestId: string,
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

    // 4. Perform direct transfer inside SERIALIZABLE transaction block
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const walletRepo = manager.getRepository(Wallet);
      const transactionRepo = manager.getRepository(Transaction);
      const auditRepo = manager.getRepository(TransactionAudit);

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

      // Generate unique transaction references for audit trail separation
      const refIdSender = `TXN-SND-${randomBytes(4).toString('hex').toUpperCase()}`;
      const refIdRecipient = `TXN-RCV-${randomBytes(4).toString('hex').toUpperCase()}`;

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
        type: TransactionType.TRANSFER,
        status: TransactionStatus.SUCCESS,
        requestId: `${requestId}-rcv`,
        balanceAfter: recipientWallet.balance,
      });
      await transactionRepo.save(recipientTxn);

      // Log audit records
      const auditSender = auditRepo.create({
        transactionId: savedSenderTxn.id,
        fromStatus: null,
        toStatus: TransactionStatus.SUCCESS,
        actor: 'user',
      } as any);
      await auditRepo.save(auditSender);

      return {
        message: 'Funds transferred successfully',
        referenceId: refIdSender,
        amount,
        balance: senderWallet.balance,
      };
    });
  }

  async getHistory(userId: string): Promise<any[]> {
    const txs = await this.transactionRepository.find({
      where: [
        { userId, status: TransactionStatus.SUCCESS },
        { userId, status: TransactionStatus.REFUNDED },
      ],
      order: { createdAt: 'DESC' },
    });

    return txs.map((tx) => {
      let typeLabel = tx.type;
      if (tx.type === TransactionType.TRANSFER) {
        typeLabel = tx.referenceId.startsWith('TXN-SND-') 
          ? 'TRANSFER_OUT' as any 
          : 'TRANSFER_IN' as any;
      }
      return {
        referenceId: tx.referenceId,
        type: typeLabel,
        amount: tx.amount,
        balanceAfter: tx.balanceAfter,
        status: tx.status,
        createdAt: tx.createdAt,
      };
    });
  }
}
