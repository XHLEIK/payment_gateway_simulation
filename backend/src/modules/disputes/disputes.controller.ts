import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DisputesService } from './disputes.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';
import { DisputeStatus } from './entities/dispute.entity';

@Controller('disputes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DisputesController {
  constructor(private readonly disputesService: DisputesService) {}

  // Post endpoint for candidates to log a dispute claim on a specific transaction
  @Post()
  async create(
    @CurrentUser() user: any,
    @Body() body: { transactionId: string; reason: string; evidence?: string },
  ) {
    return this.disputesService.create(
      user.userId,
      body.transactionId,
      body.reason,
      body.evidence,
    );
  }

  // Lists disputes. Restricts standard users to only their own claims,
  // while allowing admins to view all claims across the portal.
  @Get()
  async findAll(
    @CurrentUser() user: any,
    @Query('status') status?: DisputeStatus,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const result = await this.disputesService.findAll({
      userId: user.userId,
      isAdmin: user.role === UserRole.ADMIN,
      status,
      page: page ? parseInt(page as any, 10) : 1,
      limit: limit ? parseInt(limit as any, 10) : 20,
    });

    return {
      items: result.items.map((d) => ({
        id: d.id,
        transactionId: d.transactionId,
        reason: d.reason,
        evidence: d.evidence,
        status: d.status,
        adminNotes: d.adminNotes,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        transaction: d.transaction ? {
          referenceId: d.transaction.referenceId,
          amount: d.transaction.amount,
          type: d.transaction.type,
          status: d.transaction.status,
        } : null,
        user: d.user ? {
          id: d.user.id,
          name: d.user.name,
          email: d.user.email,
        } : null,
        resolvedBy: d.resolvedBy ? {
          name: d.resolvedBy.name,
        } : null,
      })),
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    };
  }

  // Admin route to update the dispute status (e.g. resolve and trigger wallet compensation)
  @Patch(':id/status')
  @Roles(UserRole.ADMIN)
  async updateStatus(
    @Param('id') id: string,
    @CurrentUser() admin: any,
    @Body() body: { status: DisputeStatus; adminNotes?: string },
  ) {
    return this.disputesService.updateStatus(
      id,
      body.status,
      admin.userId,
      body.adminNotes,
    );
  }
}
