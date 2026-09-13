import { Module } from '@nestjs/common';
import { PermissionsController } from './permissions.controller.ts';

@Module({controllers: [PermissionsController]}) export class PermissionsModule {}
