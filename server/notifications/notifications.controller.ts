import { Controller, Get, Inject, Param, Patch, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type AuthRequest } from '../common/auth.ts';
import { notificationsSchema } from './notifications.schemas.ts';
import { NotificationsService } from './notifications.service.ts';

@ApiTags('Bildirimler')
@ApiBearerAuth('bearer')
@ApiResponse({ status: 401, description: 'Oturum gerekli.' })
@Controller('api/notifications')
export class NotificationsController {
  constructor(@Inject(NotificationsService) private service: NotificationsService) { }
  @ApiOperation({ summary: 'Kendi bildirimlerim (son 50) ve okunmamış sayısı' })
  @ApiResponse({ status: 200, schema: notificationsSchema })
  @Get() async all(@Req() req: AuthRequest) { return this.service.all(req); }
  @ApiOperation({ summary: 'Tek bildirimi okundu işaretle' })
  @ApiResponse({ status: 200, schema: notificationsSchema })
  @Patch(':id/read') async read(@Req() req: AuthRequest, @Param('id') id: string) { return this.service.read(req, id); }
  @ApiOperation({ summary: 'Tüm bildirimleri okundu işaretle' })
  @ApiResponse({ status: 200, schema: notificationsSchema })
  @Patch('read') async readAll(@Req() req: AuthRequest) { return this.service.readAll(req); }
}
