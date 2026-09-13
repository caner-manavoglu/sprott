import { Module } from '@nestjs/common';
import { UsersController } from './users.controller.ts';

@Module({controllers: [UsersController]}) export class UsersModule {}
