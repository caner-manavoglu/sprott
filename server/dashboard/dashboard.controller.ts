import { Controller, Get, Inject } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../common/auth.ts';
import type { User } from '../common/fields.ts';
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
  @Get() async summary(@CurrentUser() user: User) { return this.service.summary(user); }
  @ApiOperation({ summary: 'Süresi geçen task’lar: bitiş tarihi bugünden önce olan ve tamamlanmamış task’lar' })
  @ApiResponse({ status: 200, schema: overdueSchema })
  @Get('overdue') async overdue(@CurrentUser() user: User) { return this.service.overdue(user); }
}
