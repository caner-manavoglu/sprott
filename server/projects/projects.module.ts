import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller.ts';

@Module({controllers: [ProjectsController]}) export class ProjectsModule {}
