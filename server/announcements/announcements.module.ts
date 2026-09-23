import { Module } from '@nestjs/common';
import { AnnouncementsController } from './announcements.controller.ts';
import { AnnouncementsService } from './announcements.service.ts';
@Module({ providers: [AnnouncementsService], controllers: [AnnouncementsController] })
export class AnnouncementsModule { }
