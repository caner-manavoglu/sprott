import { Module } from '@nestjs/common';
import { UsersController } from './users.controller.ts';
import { UsersService } from './users.service.ts';

@Module({ providers: [UsersService], controllers: [UsersController] }) export class UsersModule { }
