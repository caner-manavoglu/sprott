import { Module } from '@nestjs/common';
import { ColumnsController } from './columns.controller.ts';

// Pano verisi projeye bağlı olduğu için GET /api/projects/:id/board üzerinden döner; burada yalnızca sütun yönetimi kalır.
@Module({controllers: [ColumnsController]}) export class BoardModule {}
