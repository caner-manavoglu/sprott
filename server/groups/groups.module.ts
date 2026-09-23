import { Module } from '@nestjs/common';
import { GroupsController } from './groups.controller.ts';
import { GroupsService } from './groups.service.ts';

@Module({ providers: [GroupsService], controllers: [GroupsController] }) export class GroupsModule { }
