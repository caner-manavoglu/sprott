import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.ts';
import { NotificationsService } from './notifications.service.ts';

@Module({ providers: [NotificationsService], controllers: [NotificationsController] }) export class NotificationsModule { }
