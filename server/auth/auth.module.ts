import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.ts';
import { AuthService } from './auth.service.ts';

@Module({ providers: [AuthService], controllers: [AuthController] }) export class AuthModule { }
