import { Controller, Get, Inject, Param, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type AuthRequest } from '../common/auth.ts';
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
  @Get() async index(@Req() req: AuthRequest) { return this.service.index(req); }
  @ApiOperation({ summary: 'Personelin proje bazlı tamamlanan task raporu' })
  @ApiParam({ name: 'id', type: Number, example: 2 })
  @ApiResponse({ status: 403, description: 'Bu personelin raporunu görme yetkiniz yok.' })
  @ApiResponse({ status: 404, description: 'Kayıt bulunamadı.' })
  @ApiResponse({ status: 200, schema: reportDetailSchema })
  @Get(':id') async detail(@Req() req: AuthRequest, @Param('id') rawId: string) { return this.service.detail(req, rawId); }
}
