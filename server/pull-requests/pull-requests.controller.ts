import { BadRequestException, Body, Controller, Delete, Get, Inject, NotFoundException, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Store, TODAY, idField, textField, type User } from '../store.ts';
import { type AuthRequest, allow } from '../common/auth.ts';
import { editPullRequestSchema, newPullRequestSchema, pullRequestsSchema, statePullRequestSchema } from './pull-requests.schemas.ts';

type PrState = 'open' | 'merged' | 'closed';
const STATES: PrState[] = ['open', 'merged', 'closed'];

@ApiTags('Pull request’ler')
@ApiBearerAuth('bearer')
@ApiResponse({status: 401, description: 'Oturum gerekli.'})
@ApiResponse({status: 403, description: 'Yetki reddedildi.'})
@Controller('api/pull-requests')
export class PullRequestsController {
  constructor(@Inject(Store) private store: Store) {}

  /** Yalnızca http(s) adresleri kabul edilir; `javascript:` gibi şemalar arayüzde bağlantı olarak açılır. */
  private urlField(value: unknown) {
    const url = textField(value, 'PR adresi', 500);
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw new BadRequestException('PR adresi geçerli bir bağlantı olmalı.'); }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new BadRequestException('PR adresi http veya https olmalı.');
    return parsed.toString();
  }

  private state(value: unknown): PrState {
    if (typeof value !== 'string' || !STATES.includes(value as PrState)) throw new BadRequestException('Geçersiz PR durumu.');
    return value as PrState;
  }

  /** Bağlanacak task'lar aynı projede olmalı; aksi halde erişim kontrolü delinir. */
  private async taskIds(projectId: number, value: unknown) {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) throw new BadRequestException('Task listesi geçersiz.');
    const ids = [...new Set(value.map(idField))];
    if (!ids.length) return [];
    const found = (await this.store.db.query(
      `SELECT t.id FROM tasks t JOIN columns c ON c.id=t."columnId" WHERE t.id = ANY($1) AND c."projectId"=$2`,
      [ids, projectId],
    )).rowCount;
    if (found !== ids.length) throw new BadRequestException('Task’lar PR ile aynı projede olmalı.');
    return ids;
  }

  /** PR kaydı + projesi; erişimi olmayan kullanıcıya 404/403 döner. */
  private async reachablePr(user: User, pullRequestId: number) {
    const row = (await this.store.db.query(
      'SELECT id, "projectId", url, title, state FROM pull_requests WHERE id=$1', [pullRequestId],
    )).rows[0] as {id: number; projectId: number; url: string; title: string; state: PrState} | undefined;
    if (!row) throw new NotFoundException('PR bulunamadı.');
    await this.store.reachable(user, row.projectId);
    return row;
  }

  /** PR olayları bağlı her task'ın günlüğüne ayrı satır olarak düşer; task bazlı filtre anlamlı kalsın diye. */
  private async logForTasks(projectId: number, taskIds: number[], action: 'pr.link' | 'pr.unlink' | 'pr.merge', detail: string, actor: User) {
    if (!taskIds.length) return;
    const rows = (await this.store.db.query('SELECT id, title FROM tasks WHERE id = ANY($1)', [taskIds])).rows as {id: number; title: string}[];
    for (const task of rows) {
      await this.store.log({projectId, taskId: task.id, taskTitle: task.title, action, detail, actor});
    }
  }

  private async rows(projectId: number) {
    return (await this.store.db.query(`
      SELECT pr.id, pr."projectId", p.name AS "projectName", pr.url, pr.title, pr.description, pr.state,
        pr."mergedAt", pr."createdAt",
        (${TODAY} - pr."createdAt"::date)::int AS "waitingDays",
        NULLIF(TRIM(CONCAT_WS(' ', mb.name, mb.surname)), '') AS "mergedByName",
        NULLIF(TRIM(CONCAT_WS(' ', cb.name, cb.surname)), '') AS "createdByName",
        COALESCE((SELECT json_agg(json_build_object('id', t.id, 'title', t.title, 'columnName', c.name) ORDER BY t.id)
          FROM pull_request_tasks prt JOIN tasks t ON t.id=prt."taskId" JOIN columns c ON c.id=t."columnId"
          WHERE prt."pullRequestId"=pr.id), '[]') AS tasks
      FROM pull_requests pr
      JOIN projects p ON p.id=pr."projectId"
      LEFT JOIN users mb ON mb.id=pr."mergedBy"
      LEFT JOIN users cb ON cb.id=pr."createdBy"
      WHERE pr."projectId"=$1
      -- Bekleyenler üstte, her grupta en eski önce: en uzun bekleyen ilk sırada.
      ORDER BY (pr.state <> 'open'), pr."createdAt", pr.id`, [projectId])).rows;
  }

  /** Liste yanıtı: projeler, seçili proje, bağlanabilecek task'lar ve PR'lar. */
  private async feed(user: User, requested?: number) {
    const projectIds = await this.store.projectIds(user);
    const projects = projectIds.length
      ? (await this.store.db.query('SELECT id, name FROM projects WHERE id = ANY($1) ORDER BY name', [projectIds])).rows
      : [];
    if (!projects.length) return {projects: [], projectId: null, tasks: [], rows: []};
    const projectId = requested !== undefined && projectIds.includes(requested) ? requested : projects[0].id as number;
    const tasks = (await this.store.db.query(
      `SELECT t.id, t.title FROM tasks t JOIN columns c ON c.id=t."columnId" WHERE c."projectId"=$1 ORDER BY t.id DESC`, [projectId],
    )).rows;
    return {projects, projectId, tasks, rows: await this.rows(projectId)};
  }

  @ApiOperation({summary: 'Projenin PR’larını listele (pr.view yetkisi)'})
  @ApiQuery({name: 'projectId', required: false, type: Number, description: 'Boş bırakılırsa ilk erişilebilir proje getirilir.'})
  @ApiResponse({status: 200, schema: pullRequestsSchema})
  @Get() async index(@Req() req: AuthRequest, @Query('projectId') projectId?: string) {
    const user = allow(req, 'pr.view');
    return this.feed(user, projectId === undefined || projectId === '' ? undefined : idField(projectId));
  }

  @ApiOperation({summary: 'PR ekle (pr.create yetkisi)'})
  @ApiBody({schema: newPullRequestSchema})
  @ApiResponse({status: 400, description: 'Geçersiz istek.'})
  @ApiResponse({status: 201, schema: pullRequestsSchema})
  @Post() async create(@Req() req: AuthRequest, @Body() body: Record<string, unknown>) {
    const user = allow(req, 'pr.create');
    // Tamamlanmış projede pano dondurulur; PR eklemek de bir pano değişikliğidir.
    const projectId = await this.store.writable(user, idField(body.projectId));
    const url = this.urlField(body.url), title = textField(body.title, 'PR adı', 200);
    const description = body.description === undefined || body.description === '' ? '' : textField(body.description, 'Açıklama', 5000);
    const taskIds = await this.taskIds(projectId, body.taskIds);
    const created = await this.store.transaction(async client => {
      const inserted = (await client.query(
        'INSERT INTO pull_requests("projectId",url,title,description,"createdBy") VALUES($1,$2,$3,$4,$5) RETURNING id',
        [projectId, url, title, description, user.id],
      )).rows[0].id as number;
      for (const taskId of taskIds) await client.query(
        'INSERT INTO pull_request_tasks("pullRequestId","taskId") VALUES($1,$2)', [inserted, taskId],
      );
      return inserted;
    }).catch((error: {code?: string}) => {
      if (error.code === '23505') throw new BadRequestException('Bu PR bu projeye zaten eklenmiş.');
      throw error;
    });
    await this.logForTasks(projectId, taskIds, 'pr.link', `PR bağlandı: ${title}`, user);
    return {...await this.feed(user, projectId), createdPullRequestId: created};
  }

  @ApiOperation({summary: 'PR’ı düzenle (pr.update yetkisi)'})
  @ApiParam({name: 'id', type: Number, example: 12})
  @ApiBody({schema: editPullRequestSchema})
  @ApiResponse({status: 404, description: 'Kayıt bulunamadı.'})
  @ApiResponse({status: 200, schema: pullRequestsSchema})
  @Patch(':id') async update(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    const user = allow(req, 'pr.update');
    const pullRequest = await this.reachablePr(user, idField(id));
    await this.store.writable(user, pullRequest.projectId);
    const sets: string[] = [], values: unknown[] = [];
    if (body.url !== undefined) { values.push(this.urlField(body.url)); sets.push(`url=$${values.length}`); }
    if (body.title !== undefined) { values.push(textField(body.title, 'PR adı', 200)); sets.push(`title=$${values.length}`); }
    if (body.description !== undefined) {
      values.push(body.description === '' ? '' : textField(body.description, 'Açıklama', 5000));
      sets.push(`description=$${values.length}`);
    }
    // Bağ listesi gönderilirse tamamen değiştirilir; günlüğe yalnızca fark yazılır.
    const before = (await this.store.db.query(
      'SELECT "taskId" FROM pull_request_tasks WHERE "pullRequestId"=$1', [pullRequest.id],
    )).rows.map(row => row.taskId as number);
    const after = body.taskIds === undefined ? before : await this.taskIds(pullRequest.projectId, body.taskIds);
    if (!sets.length && body.taskIds === undefined) throw new BadRequestException('Güncellenecek alan gönderilmedi.');
    await this.store.transaction(async client => {
      if (sets.length) {
        values.push(pullRequest.id);
        await client.query(`UPDATE pull_requests SET ${sets.join(',')},"updatedAt"=NOW() WHERE id=$${values.length}`, values);
      }
      if (body.taskIds !== undefined) {
        await client.query('DELETE FROM pull_request_tasks WHERE "pullRequestId"=$1', [pullRequest.id]);
        for (const taskId of after) await client.query(
          'INSERT INTO pull_request_tasks("pullRequestId","taskId") VALUES($1,$2)', [pullRequest.id, taskId],
        );
      }
    }).catch((error: {code?: string}) => {
      if (error.code === '23505') throw new BadRequestException('Bu PR bu projeye zaten eklenmiş.');
      throw error;
    });
    const title = body.title === undefined ? pullRequest.title : String(body.title).trim();
    await this.logForTasks(pullRequest.projectId, after.filter(taskId => !before.includes(taskId)), 'pr.link', `PR bağlandı: ${title}`, user);
    await this.logForTasks(pullRequest.projectId, before.filter(taskId => !after.includes(taskId)), 'pr.unlink', `PR bağı kaldırıldı: ${title}`, user);
    return this.feed(user, pullRequest.projectId);
  }

  @ApiOperation({summary: 'PR durumunu değiştir — onaylandı/kapatıldı/bekliyor (pr.merge yetkisi)'})
  @ApiParam({name: 'id', type: Number, example: 12})
  @ApiBody({schema: statePullRequestSchema})
  @ApiResponse({status: 404, description: 'Kayıt bulunamadı.'})
  @ApiResponse({status: 200, schema: pullRequestsSchema})
  @Patch(':id/state') async setState(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    const user = allow(req, 'pr.merge');
    const pullRequest = await this.reachablePr(user, idField(id));
    await this.store.writable(user, pullRequest.projectId);
    const state = this.state(body.state);
    // 'merged' dışına çıkıldığında onay bilgisi temizlenir; yanlış işaretleme geri alınabilir.
    await this.store.db.query(
      `UPDATE pull_requests SET state=$1,
         "mergedAt" = CASE WHEN $1='merged' THEN NOW() ELSE NULL END,
         "mergedBy" = CASE WHEN $1='merged' THEN $2::int ELSE NULL END,
         "updatedAt" = NOW()
       WHERE id=$3`, [state, user.id, pullRequest.id],
    );
    if (state === 'merged' && pullRequest.state !== 'merged') {
      const linked = (await this.store.db.query(
        'SELECT "taskId" FROM pull_request_tasks WHERE "pullRequestId"=$1', [pullRequest.id],
      )).rows.map(row => row.taskId as number);
      await this.logForTasks(pullRequest.projectId, linked, 'pr.merge', `PR onaylandı: ${pullRequest.title}`, user);
    }
    return this.feed(user, pullRequest.projectId);
  }

  @ApiOperation({summary: 'PR’ı sil (pr.delete yetkisi)'})
  @ApiParam({name: 'id', type: Number, example: 12})
  @ApiResponse({status: 404, description: 'Kayıt bulunamadı.'})
  @ApiResponse({status: 200, schema: pullRequestsSchema})
  @Delete(':id') async remove(@Req() req: AuthRequest, @Param('id') id: string) {
    const user = allow(req, 'pr.delete');
    const pullRequest = await this.reachablePr(user, idField(id));
    await this.store.writable(user, pullRequest.projectId);
    const linked = (await this.store.db.query(
      'SELECT "taskId" FROM pull_request_tasks WHERE "pullRequestId"=$1', [pullRequest.id],
    )).rows.map(row => row.taskId as number);
    await this.store.db.query('DELETE FROM pull_requests WHERE id=$1', [pullRequest.id]);
    await this.logForTasks(pullRequest.projectId, linked, 'pr.unlink', `PR silindi: ${pullRequest.title}`, user);
    return this.feed(user, pullRequest.projectId);
  }
}
