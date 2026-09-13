import { Module } from '@nestjs/common';
import { GroupsController } from './groups.controller.ts';

@Module({controllers: [GroupsController]}) export class GroupsModule {}
