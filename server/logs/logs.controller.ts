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
  /** Sayfa başına kayıt; istemci de aynı değeri yanıttan okur. */
  static readonly pageSize = 50;

  constructor(@Inject(Store) private store: Store) {}
  @ApiOperation({summary: 'Proje etkinlik günlüğü (log.view yetkisi); sayfalı, salt okunur'})
  @ApiQuery({name: 'projectId', required: false, description: 'Boş bırakılırsa erişilebilen ilk proje getirilir.', example: 1})
  @ApiQuery({name: 'taskId', required: false, description: 'Yalnızca bu task’ın kayıtları.', example: 4})
  @ApiQuery({name: 'actorId', required: false, description: 'Yalnızca bu personelin kayıtları.', example: 3})
  @ApiQuery({name: 'page', required: false, description: `1’den başlar; sayfa başına ${LogsController.pageSize} kayıt.`, example: 1})
  @ApiResponse({status: 200, schema: logSchema})
  @Get() async index(
    @Req() req: AuthRequest,
    @Query('projectId') rawProjectId?: string,
    @Query('taskId') rawTaskId?: string,
    @Query('actorId') rawActorId?: string,
    @Query('page') rawPage?: string,
  ) {
    const user = allow(req, 'log.view');
    const ids = await this.store.projectIds(user);
    const empty = {projects: [], projectId: null, tasks: [], actors: [], rows: [], total: 0, page: 1, pageSize: LogsController.pageSize};
    if (!ids.length) return empty;
    const projects = (await this.store.db.query('SELECT id, name FROM projects WHERE id = ANY($1) ORDER BY name', [ids])).rows;
    // Tanınmayan veya erişilemeyen proje istenirse ilk projeye düşülür.
    const requested = rawProjectId ? idField(rawProjectId) : null;
    const projectId = requested !== null && ids.includes(requested) ? requested : (projects[0].id as number);
    const taskId = rawTaskId ? idField(rawTaskId) : null;
    const actorId = rawActorId ? idField(rawActorId) : null;
    const page = Math.max(1, Number(rawPage) || 1);
    const [tasks, actors] = await Promise.all([
      this.store.db.query(
        'SELECT t.id, t.title FROM tasks t JOIN columns c ON c.id=t."columnId" WHERE c."projectId"=$1 ORDER BY t.id',
        [projectId],
      ),
      // Personel listesi günlüğün kendisinden türetilir; kaydı olmayan kişi filtrede görünmez.
      this.store.db.query(
        `SELECT DISTINCT "actorId" AS id, "actorName" AS name FROM activity_log
         WHERE "projectId"=$1 AND "actorId" IS NOT NULL ORDER BY name`,
        [projectId],
      ),
    ]);
    const filter = `WHERE "projectId"=$1 AND ($2::int IS NULL OR "taskId"=$2) AND ($3::int IS NULL OR "actorId"=$3)`;
    const params = [projectId, taskId, actorId];
    const total = Number((await this.store.db.query(`SELECT COUNT(*)::int AS total FROM activity_log ${filter}`, params)).rows[0].total);
    const rows = (await this.store.db.query(
      `SELECT id, action, detail, "taskId", "taskTitle", "actorId", "actorName", "createdAt"
       FROM activity_log ${filter}
       ORDER BY "createdAt" DESC, id DESC LIMIT $4 OFFSET $5`,
      [...params, LogsController.pageSize, (page - 1) * LogsController.pageSize],
    )).rows;
    return {projects, projectId, tasks, actors: actors.rows, rows, total, page, pageSize: LogsController.pageSize};
  }
}
