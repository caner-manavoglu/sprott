import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller.ts';

@Module({controllers: [ReportsController]}) export class ReportsModule {}
