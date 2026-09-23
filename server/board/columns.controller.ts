import { Body, Controller, Delete, Inject, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, ParseId } from '../common/auth.ts';
import type { User } from '../common/fields.ts';
import { DtoPipe } from '../common/dto.pipe.ts';
import { boardSchema, columnSchema, orderSchema, renameColumnSchema } from './board.schemas.ts';
import { ColumnsService } from './columns.service.ts';
import { createColumnSchema, orderColumnsSchema, renameColumnBodySchema, type CreateColumnDto, type OrderColumnsDto, type RenameColumnDto } from './dto/columns.dto.ts';

@ApiTags('Sütunlar')
@ApiBearerAuth('bearer')
@ApiResponse({ status: 401, description: 'Oturum gerekli.' })
@ApiResponse({ status: 403, description: 'Yetki reddedildi.' })
@Controller('api/columns')
export class ColumnsController {
  constructor(@Inject(ColumnsService) private service: ColumnsService) { }
  @ApiOperation({ summary: 'Projeye sütun ekle (project.update yetkisi)' })
  @ApiBody({ schema: columnSchema })
  @ApiResponse({ status: 400, description: 'Geçersiz istek.' })
  @ApiResponse({ status: 201, schema: boardSchema })
  @Post() async add(@CurrentUser() user: User, @Body(new DtoPipe(createColumnSchema)) body: CreateColumnDto) { return this.service.add(user, body); }
  @ApiOperation({ summary: 'Sütun sırasını kaydet (project.update yetkisi)' })
  @ApiBody({ schema: orderSchema })
  @ApiResponse({ status: 400, description: 'Projenin her sütunu tam bir kez gönderilmeli.' })
  @ApiResponse({ status: 200, schema: boardSchema })
  @Patch('order') async reorder(@CurrentUser() user: User, @Body(new DtoPipe(orderColumnsSchema)) body: OrderColumnsDto) { return this.service.reorder(user, body); }
  @ApiOperation({ summary: 'Sütunun adını değiştir (project.update yetkisi)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ schema: renameColumnSchema })
  @ApiResponse({ status: 400, description: 'Geçersiz istek.' })
  @ApiResponse({ status: 404, description: 'Kayıt bulunamadı.' })
  @ApiResponse({ status: 200, schema: boardSchema })
  @Patch(':id') async rename(@CurrentUser() user: User, @Param('id', ParseId) id: number, @Body(new DtoPipe(renameColumnBodySchema)) body: RenameColumnDto) { return this.service.rename(user, id, body); }
  @ApiOperation({ summary: 'Boş sütunu sil (project.update yetkisi; projenin son sütunu korunur)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiResponse({ status: 400, description: 'Geçersiz istek.' })
  @ApiResponse({ status: 404, description: 'Kayıt bulunamadı.' })
  @ApiResponse({ status: 200, schema: boardSchema })
  @Delete(':id') async remove(@CurrentUser() user: User, @Param('id', ParseId) id: number) { return this.service.remove(user, id); }
}
