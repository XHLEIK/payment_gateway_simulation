import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';
import { DataSource } from 'typeorm';
import { Transaction, TransactionType, TransactionStatus } from '../transactions/entities/transaction.entity';
import { TransactionAudit } from '../transactions/entities/transaction-audit.entity';
import { randomBytes } from 'crypto';

@Controller('wallet')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WalletController {
  constructor(
    private readonly walletsService: WalletsService,
    private readonly dataSource: DataSource,
  ) {}

  @Get('balance')
  async getBalance(@CurrentUser() user: any) {
    const balance = await this.walletsService.getBalance(user.userId);
    return { balance };
  }

  @Get('history')
  async getHistory(@CurrentUser() user: any) {
    return this.walletsService.getHistory(user.userId);
  }

  @Post('credit')
  @Roles(UserRole.ADMIN)
  async creditWallet(
    @CurrentUser() admin: any,
    @Body() body: { userId: string; amount: number },
  ) {
    const { userId, amount } = body;
    
    // We execute this credit in a serializable transaction block
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      // 1. Create a mock completed transaction record for the audit trail
      const txnRef = `TXN-${randomBytes(4).toString('hex').toUpperCase()}`;
      const txn = manager.getRepository(Transaction).create({
        referenceId: txnRef,
        userId,
        amount,
        type: TransactionType.CREDIT,
        status: TransactionStatus.SUCCESS,
        requestId: `ADMIN-CREDIT-${Date.now()}-${randomBytes(2).toString('hex')}`,
      });
      const savedTxn = await manager.getRepository(Transaction).save(txn);

      // 2. Perform wallet update with pessimistic locking inside
      const updatedWallet = await this.walletsService.credit(userId, amount, manager);

      // 3. Log to audit trail
      const audit = manager.getRepository(TransactionAudit).create({
        transactionId: savedTxn.id,
        fromStatus: null,
        toStatus: TransactionStatus.SUCCESS,
        actor: `admin:${admin.userId}`,
      } as any);
      await manager.getRepository(TransactionAudit).save(audit);

      return {
        message: 'Wallet credited successfully',
        balance: updatedWallet.balance,
        referenceId: txnRef,
      };
    });
  }

  @Post('send-money')
  async sendMoney(
    @CurrentUser() user: any,
    @Body() body: { recipientEmail: string; amount: number; pin: string; requestId: string },
  ) {
    const { recipientEmail, amount, pin, requestId } = body;
    return this.walletsService.sendMoney(user.userId, recipientEmail, amount, pin, requestId);
  }
}
