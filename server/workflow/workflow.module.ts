import { Module } from '@nestjs/common';
import { WorkflowController } from './workflow.controller.ts';

@Module({controllers: [WorkflowController]}) export class WorkflowModule {}
