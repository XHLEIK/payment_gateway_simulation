import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  ForbiddenException,
  Req,
} from '@nestjs/common';
import { RefundsService } from './refunds.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';
import { TransactionsService } from '../transactions/transactions.service';

@Controller('refunds')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RefundsController {
  constructor(
    private readonly refundsService: RefundsService,
    private readonly transactionsService: TransactionsService,
  ) {}

  @Post('request')
  async requestRefund(
    @CurrentUser() user: any,
    @Body() body: { transactionId: string; amount: number; reason: string },
  ) {
    const txn = await this.transactionsService.findOne(body.transactionId);
    if (user.role !== UserRole.ADMIN && txn.userId !== user.userId) {
      throw new ForbiddenException('You can only request refunds for your own transactions');
    }

    return this.refundsService.request({
      transactionId: body.transactionId,
      amount: body.amount,
      reason: body.reason,
    });
  }

  @Post('approve/:id')
  @Roles(UserRole.ADMIN)
  async approveRefund(
    @CurrentUser() admin: any,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    const correlationId = req['correlationId'];
    return this.refundsService.approve(id, admin.userId, correlationId);
  }

  @Post('reject/:id')
  @Roles(UserRole.ADMIN)
  async rejectRefund(@CurrentUser() admin: any, @Param('id') id: string) {
    return this.refundsService.reject(id, admin.userId);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  async findAll() {
    return this.refundsService.findAll();
  }
}
