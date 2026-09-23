import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.ts';
import { WorkspaceService } from './workspace.service.ts';

@Global()
@Module({ imports: [PrismaModule], providers: [WorkspaceService], exports: [WorkspaceService] })
export class WorkspaceModule { }
