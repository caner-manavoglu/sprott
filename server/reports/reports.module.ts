import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller.ts';
import { ReportsService } from './reports.service.ts';

@Module({ providers: [ReportsService], controllers: [ReportsController] }) export class ReportsModule { }
