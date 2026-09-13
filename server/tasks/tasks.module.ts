import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller.ts';

@Module({controllers: [TasksController]}) export class TasksModule {}
