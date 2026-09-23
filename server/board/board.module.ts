import { Module } from '@nestjs/common';
import { ColumnsController } from './columns.controller.ts';
import { ColumnsService } from './columns.service.ts';

// Pano verisi projeye bağlı olduğu için GET /api/projects/:id/board üzerinden döner; burada yalnızca sütun yönetimi kalır.
@Module({ providers: [ColumnsService], controllers: [ColumnsController] }) export class BoardModule { }
