import { Module } from '@nestjs/common';
import { PullRequestsController } from './pull-requests.controller.ts';
import { PullRequestsService } from './pull-requests.service.ts';
@Module({ providers: [PullRequestsService], controllers: [PullRequestsController] })
export class PullRequestsModule { }
