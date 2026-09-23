import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller.ts';
import { TasksService } from './tasks.service.ts';

@Module({ providers: [TasksService], controllers: [TasksController] }) export class TasksModule { }
