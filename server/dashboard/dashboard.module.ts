import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller.ts';

@Module({controllers: [DashboardController]}) export class DashboardModule {}
