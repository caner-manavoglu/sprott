import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type AuthRequest } from '../common/auth.ts';
import { logSchema } from './logs.schemas.ts';
import { LogsService } from './logs.service.ts';

@ApiTags('Loglar')
@ApiBearerAuth('bearer')
@ApiResponse({ status: 401, description: 'Oturum gerekli.' })
@ApiResponse({ status: 403, description: 'Log görüntüleme yetkisi gerekli.' })
@Controller('api/logs')
export class LogsController {
  constructor(@Inject(LogsService) private service: LogsService) { }
  @ApiOperation({ summary: 'Proje etkinlik günlüğü (log.view yetkisi); sayfalı, salt okunur' })
  @ApiQuery({ name: 'projectId', required: false, description: 'Boş bırakılırsa erişilebilen ilk proje getirilir.', example: 1 })
  @ApiQuery({ name: 'taskId', required: false, description: 'Yalnızca bu task’ın kayıtları.', example: 4 })
  @ApiQuery({ name: 'actorId', required: false, description: 'Yalnızca bu personelin kayıtları.', example: 3 })
  @ApiQuery({ name: 'page', required: false, description: '1’den başlar.', example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, description: `Sayfa başına kayıt; yalnızca ${LogsService.pageSizes.join(', ')} kabul edilir.`, example: 10 })
  @ApiResponse({ status: 200, schema: logSchema })
  @Get() async index(
    @Req() req: AuthRequest,
    @Query('projectId') rawProjectId?: string,
    @Query('taskId') rawTaskId?: string,
    @Query('actorId') rawActorId?: string,
    @Query('page') rawPage?: string,
    @Query('pageSize') rawPageSize?: string,
  ) { return this.service.index(req, rawProjectId, rawTaskId, rawActorId, rawPage, rawPageSize); }
}
