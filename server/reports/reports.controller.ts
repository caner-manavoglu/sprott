import { Controller, Get, Inject, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, ParseId } from '../common/auth.ts';
import type { User } from '../common/fields.ts';
import { reportDetailSchema, reportSchema } from './reports.schemas.ts';
import { ReportsService } from './reports.service.ts';

@ApiTags('Raporlar')
@ApiBearerAuth('bearer')
@ApiResponse({ status: 401, description: 'Oturum gerekli.' })
@Controller('api/reports')
export class ReportsController {
  constructor(@Inject(ReportsService) private service: ReportsService) { }
  @ApiOperation({ summary: 'Tamamlanan task raporu: yetkiye göre tüm personel, yönetilen grupların üyeleri veya yalnızca kendisi' })
  @ApiResponse({ status: 200, schema: reportSchema })
  @Get() async index(@CurrentUser() user: User) { return this.service.index(user); }
  @ApiOperation({ summary: 'Personelin proje bazlı tamamlanan task raporu' })
  @ApiParam({ name: 'id', type: Number, example: 2 })
  @ApiResponse({ status: 403, description: 'Bu personelin raporunu görme yetkiniz yok.' })
  @ApiResponse({ status: 404, description: 'Kayıt bulunamadı.' })
  @ApiResponse({ status: 200, schema: reportDetailSchema })
  @Get(':id') async detail(@CurrentUser() user: User, @Param('id', ParseId) id: number) { return this.service.detail(user, id); }
}
