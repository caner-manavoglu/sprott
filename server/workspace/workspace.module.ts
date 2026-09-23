import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.ts';
import { AccessService } from './access.service.ts';
import { ActivityLogService } from './activity-log.service.ts';
import { NotifierService } from './notifier.service.ts';
import { WorkspaceService } from './workspace.service.ts';

const services = [WorkspaceService, AccessService, NotifierService, ActivityLogService];

@Global()
@Module({ imports: [PrismaModule], providers: services, exports: services })
export class WorkspaceModule { }
