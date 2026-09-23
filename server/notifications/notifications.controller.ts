import { Controller, Get, Inject, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, ParseId } from '../common/auth.ts';
import type { User } from '../common/fields.ts';
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
  @Get() async all(@CurrentUser() user: User) { return this.service.all(user); }
  @ApiOperation({ summary: 'Tek bildirimi okundu işaretle' })
  @ApiResponse({ status: 200, schema: notificationsSchema })
  @Patch(':id/read') async read(@CurrentUser() user: User, @Param('id', ParseId) id: number) { return this.service.read(user, id); }
  @ApiOperation({ summary: 'Tüm bildirimleri okundu işaretle' })
  @ApiResponse({ status: 200, schema: notificationsSchema })
  @Patch('read') async readAll(@CurrentUser() user: User) { return this.service.readAll(user); }
}
