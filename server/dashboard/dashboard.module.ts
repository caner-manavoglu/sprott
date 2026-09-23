import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller.ts';
import { DashboardService } from './dashboard.service.ts';

@Module({ providers: [DashboardService], controllers: [DashboardController] }) export class DashboardModule { }
