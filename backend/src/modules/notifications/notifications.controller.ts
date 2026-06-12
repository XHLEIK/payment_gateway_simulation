import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async findAll(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.notificationsService.findAll(
      user.userId,
      page ? parseInt(page as any, 10) : 1,
      limit ? parseInt(limit as any, 10) : 20,
    );
  }

  @Get('unread-count')
  async getUnreadCount(@CurrentUser() user: any) {
    const count = await this.notificationsService.getUnreadCount(user.userId);
    return { count };
  }

  @Patch(':id/read')
  async markRead(@Param('id') id: string, @CurrentUser() user: any) {
    await this.notificationsService.markRead(id, user.userId);
    return { message: 'Notification marked as read' };
  }

  @Patch('read-all')
  async markAllRead(@CurrentUser() user: any) {
    await this.notificationsService.markAllRead(user.userId);
    return { message: 'All notifications marked as read' };
  }
}
