import { Module } from '@nestjs/common';
import { WorkflowController } from './workflow.controller.ts';
import { WorkflowService } from './workflow.service.ts';

@Module({ providers: [WorkflowService], controllers: [WorkflowController] }) export class WorkflowModule { }
