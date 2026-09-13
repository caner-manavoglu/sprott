import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Store, idField } from '../store.ts';
import { type AuthRequest, allow } from '../common/auth.ts';
import { logSchema } from './logs.schemas.ts';

/**
 * Etkinlik günlüğü salt okunurdur: bu modülde yalnızca GET vardır.
 * Kayıt ekleme, güncelleme ve silme uçları bilinçli olarak yoktur; günlük
 * kayıtları yalnızca ilgili işlemin yan etkisi olarak `Store.log` ile yazılır.
 */
@ApiTags('Loglar')
@ApiBearerAuth('bearer')
@ApiResponse({status: 401, description: 'Oturum gerekli.'})
@ApiResponse({status: 403, description: 'Log görüntüleme yetkisi gerekli.'})
@Controller('api/logs')
export class LogsController {
  constructor(@Inject(Store) private store: Store) {}
  @ApiOperation({summary: 'Proje etkinlik günlüğü (log.view yetkisi); kronolojik, salt okunur'})
  @ApiQuery({name: 'projectId', required: false, description: 'Boş bırakılırsa erişilebilen ilk proje getirilir.', example: 1})
  @ApiQuery({name: 'taskId', required: false, description: 'Yalnızca bu task’ın kayıtları.', example: 4})
  @ApiResponse({status: 200, schema: logSchema})
  @Get() async index(@Req() req: AuthRequest, @Query('projectId') rawProjectId?: string, @Query('taskId') rawTaskId?: string) {
    const user = allow(req, 'log.view');
    const ids = await this.store.projectIds(user);
    if (!ids.length) return {projects: [], projectId: null, tasks: [], rows: []};
    const projects = (await this.store.db.query('SELECT id, name FROM projects WHERE id = ANY($1) ORDER BY name', [ids])).rows;
    // Tanınmayan veya erişilemeyen proje istenirse ilk projeye düşülür.
    const requested = rawProjectId ? idField(rawProjectId) : null;
    const projectId = requested !== null && ids.includes(requested) ? requested : (projects[0].id as number);
    const taskId = rawTaskId ? idField(rawTaskId) : null;
    const tasks = (await this.store.db.query(
      'SELECT t.id, t.title FROM tasks t JOIN columns c ON c.id=t."columnId" WHERE c."projectId"=$1 ORDER BY t.id',
      [projectId],
    )).rows;
    const rows = (await this.store.db.query(
      `SELECT id, action, detail, "taskId", "taskTitle", "actorId", "actorName", "createdAt"
       FROM activity_log WHERE "projectId"=$1 AND ($2::int IS NULL OR "taskId"=$2)
       ORDER BY "createdAt", id`,
      [projectId, taskId],
    )).rows;
    return {projects, projectId, tasks, rows};
  }
}
