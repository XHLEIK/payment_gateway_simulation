import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  // Retrieves aggregated transaction stats. Admin-only route.
  @Get('summary')
  @Roles(UserRole.ADMIN)
  async getSummary(@Query('period') period?: string) {
    // We support 'weekly' (default, 7 days) and 'monthly' (30 days) aggregation periods
    const selectedPeriod = period === 'monthly' ? 'monthly' : 'weekly';
    return this.analyticsService.getSummary(selectedPeriod);
  }
}
