/**
 * P5 Phase 2.3: 通知 REST API 控制器
 * 提供 REST 端点作为 WebSocket 的补充（初始加载、离线恢复）
 */

import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationService } from './notification.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private notificationService: NotificationService) {}

  @Get()
  async getNotifications(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ): Promise<any> {
    return this.notificationService.getUserNotifications(req.user.userId, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      unreadOnly: unreadOnly === 'true',
    });
  }

  @Get('unread-count')
  async getUnreadCount(@Req() req: any) {
    const count = await this.notificationService.getUnreadCount(req.user.userId);
    return { unreadCount: count };
  }

  @Patch(':id/read')
  async markAsRead(@Req() req: any, @Param('id') id: string) {
    const success = await this.notificationService.markAsRead(id, req.user.userId);
    return { success };
  }

  @Patch('read-all')
  async markAllAsRead(@Req() req: any) {
    const count = await this.notificationService.markAllAsRead(req.user.userId);
    return { markedCount: count };
  }
}
