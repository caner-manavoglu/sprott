import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.ts';

@Module({controllers: [NotificationsController]}) export class NotificationsModule {}
