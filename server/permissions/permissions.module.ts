import { Module } from '@nestjs/common';
import { PermissionsController } from './permissions.controller.ts';
import { PermissionsService } from './permissions.service.ts';

@Module({ providers: [PermissionsService], controllers: [PermissionsController] }) export class PermissionsModule { }
