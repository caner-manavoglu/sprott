import { Controller, Get, Inject, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { type AuthRequest } from '../common/auth.ts';
import { dashboardSchema, overdueSchema } from './dashboard.schemas.ts';
import { DashboardService } from './dashboard.service.ts';

@ApiTags('Özet')
@ApiBearerAuth('bearer')
@ApiResponse({ status: 401, description: 'Oturum gerekli.' })
@Controller('api/dashboard')
export class DashboardController {
  constructor(@Inject(DashboardService) private service: DashboardService) { }
  @ApiOperation({ summary: 'Giriş sonrası özet: yönetici tüm task sayımlarını, personel kendine atanan task’ları görür' })
  @ApiResponse({ status: 200, schema: dashboardSchema })
  @Get() async summary(@Req() req: AuthRequest) { return this.service.summary(req); }
  @ApiOperation({ summary: 'Süresi geçen task’lar: bitiş tarihi bugünden önce olan ve tamamlanmamış task’lar' })
  @ApiResponse({ status: 200, schema: overdueSchema })
  @Get('overdue') async overdue(@Req() req: AuthRequest) { return this.service.overdue(req); }
}
