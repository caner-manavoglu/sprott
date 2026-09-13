import { Module } from '@nestjs/common';
import { AnnouncementsController } from './announcements.controller.ts';
@Module({controllers: [AnnouncementsController]})
export class AnnouncementsModule {}
