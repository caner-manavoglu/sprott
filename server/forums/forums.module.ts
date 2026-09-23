import { Module } from '@nestjs/common';
import { ForumsController } from './forums.controller.ts';
import { ForumsService } from './forums.service.ts';

@Module({ controllers: [ForumsController], providers: [ForumsService] })
export class ForumsModule { }
