import { Module } from '@nestjs/common';
import { LogsController } from './logs.controller.ts';

@Module({controllers: [LogsController]})
export class LogsModule {}
