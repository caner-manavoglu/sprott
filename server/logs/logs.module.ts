import { Module } from '@nestjs/common';
import { LogsController } from './logs.controller.ts';
import { LogsService } from './logs.service.ts';

@Module({ providers: [LogsService], controllers: [LogsController] })
export class LogsModule { }
