import { Module } from '@nestjs/common';
import { PullRequestsController } from './pull-requests.controller.ts';
@Module({controllers: [PullRequestsController]})
export class PullRequestsModule {}
