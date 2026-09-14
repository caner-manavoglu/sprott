import { BadRequestException, Body, Controller, Delete, Get, Inject, NotFoundException, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Store, dateField, idField, textField } from '../store.ts';
import { type AuthRequest, allow, current } from '../common/auth.ts';
import { usersSchema } from '../common/schemas.ts';
import { boardSchema } from '../board/board.schemas.ts';
import { completionSchema, editProjectSchema, memberSchema, newProjectSchema, projectsSchema } from './projects.schemas.ts';

@ApiTags('Projeler')
@ApiBearerAuth('bearer')
@ApiResponse({status: 401, description: 'Oturum gerekli.'})
@ApiResponse({status: 403, description: 'Yetki reddedildi.'})
@Controller('api/projects')
export class ProjectsController {
  constructor(@Inject(Store) private store: Store) {}
  /** Erişilebilir projeler, sütun/task/üye sayımlarıyla. */
  private async list(ids: number[]) {
    if (!ids.length) return [];
    return (await this.store.db.query(`
      SELECT p.id, p.name, p.description,
        to_char(p."startDate", 'YYYY-MM-DD') AS "startDate",
        to_char(p."endDate", 'YYYY-MM-DD') AS "endDate",
        to_char(p."completedAt", 'YYYY-MM-DD') AS "completedAt",
        (SELECT COUNT(*)::int FROM columns c WHERE c."projectId"=p.id) AS "columnCount",
        (SELECT COUNT(*)::int FROM tasks t JOIN columns c ON c.id=t."columnId" WHERE c."projectId"=p.id) AS "taskCount",
        (SELECT COUNT(*)::int FROM project_members m WHERE m."projectId"=p.id) AS "memberCount"
      FROM projects p WHERE p.id = ANY($1) ORDER BY p.id`, [ids])).rows;
  }
  // Tarihler isteğe bağlıdır ve birbirine göre doğrulanmaz; yalnızca kaydedilir.
  private fields(body: Record<string, unknown>, required: boolean) {
    const values: Record<string, string | null> = {};
    if (required || body.name !== undefined) values.name = textField(body.name, 'Proje adı', 80);
    if (body.description !== undefined) values.description = typeof body.description === 'string' && body.description.trim().length <= 2000
      ? body.description.trim() : (() => { throw new BadRequestException('Açıklama en fazla 2000 karakter olmalı.'); })();
    if (body.startDate !== undefined) values.startDate = dateField(body.startDate, 'Başlangıç tarihi');
    if (body.endDate !== undefined) values.endDate = dateField(body.endDate, 'Bitiş tarihi');
    return values;
  }
  @ApiOperation({summary: 'Projeleri listele (project.view yetkisi; personel yalnızca üyesi olduklarını görür)'})
  @ApiResponse({status: 200, schema: projectsSchema})
  @Get() async index(@Req() req: AuthRequest) {
    const user = allow(req, 'project.view');
    return this.list(await this.store.projectIds(user));
  }
  @ApiOperation({summary: 'Proje oluştur (project.create yetkisi)'})
  @ApiBody({schema: newProjectSchema})
  @ApiResponse({status: 400, description: 'Geçersiz istek.'})
  @ApiResponse({status: 201, schema: projectsSchema})
  @Post() async create(@Req() req: AuthRequest, @Body() body: Record<string, unknown>) {
    const user = allow(req, 'project.create');
    const {name, description = '', startDate = null, endDate = null} = this.fields(body, true);
    await this.store.transaction(async client => {
      const project = (await client.query(
        'INSERT INTO projects(name,description,"createdBy","startDate","endDate") VALUES($1,$2,$3,$4,$5) RETURNING id',
        [name, description, user.id, startDate, endDate],
      )).rows[0].id;
      // Kurucu kendi projesini panoda görebilsin diye üye olarak eklenir.
      await client.query('INSERT INTO project_members("projectId","userId") VALUES($1,$2) ON CONFLICT DO NOTHING', [project, user.id]);
      // Boş pano kullanışsız olduğu için varsayılan sütunlarla başlar.
      for (const column of ['Yapılacak', 'Devam ediyor', 'Tamamlandı']) {
        await client.query('INSERT INTO columns(name,position,"projectId") SELECT $1, COALESCE(MAX(position),0)+1, $2 FROM columns WHERE "projectId"=$2', [column, project]);
      }
    });
    return this.list(await this.store.projectIds(user));
  }
  @ApiOperation({summary: 'Projeyi güncelle (project.update yetkisi)'})
  @ApiParam({name: 'id', type: Number, example: 1})
  @ApiBody({schema: editProjectSchema})
  @ApiResponse({status: 400, description: 'Geçersiz istek.'})
  @ApiResponse({status: 404, description: 'Kayıt bulunamadı.'})
  @ApiResponse({status: 200, schema: projectsSchema})
  @Patch(':id') async update(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    const user = allow(req, 'project.update');
    const projectId = await this.store.reachable(user, idField(id));
    const fields = this.fields(body, false), keys = Object.keys(fields);
    if (!keys.length) throw new BadRequestException('Güncellenecek alan gönderilmedi.');
    const sets = keys.map((key, index) => `"${key}"=$${index + 1}`).join(',');
    await this.store.db.query(`UPDATE projects SET ${sets} WHERE id=$${keys.length + 1}`, [...keys.map(key => fields[key]), projectId]);
    return this.list(await this.store.projectIds(user));
  }
  @ApiOperation({summary: 'Projeyi tamamla veya yeniden aç (project.update yetkisi)'})
  @ApiParam({name: 'id', type: Number, example: 1})
  @ApiBody({schema: completionSchema})
  @ApiResponse({status: 404, description: 'Kayıt bulunamadı.'})
  @ApiResponse({status: 200, schema: projectsSchema})
  @Patch(':id/completion') async completion(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    const user = allow(req, 'project.update');
    const projectId = await this.store.reachable(user, idField(id));
    if (typeof body.completed !== 'boolean') throw new BadRequestException('completed alanı true veya false olmalı.');
    // Tamamlanan projenin panosu dondurulur; kayıtların hiçbiri silinmez.
    await this.store.db.query('UPDATE projects SET "completedAt" = CASE WHEN $1 THEN COALESCE("completedAt", NOW()) ELSE NULL END WHERE id=$2', [body.completed, projectId]);
    return this.list(await this.store.projectIds(user));
  }
  @ApiOperation({summary: 'Projeyi sil (project.delete yetkisi; task’ları olan proje silinemez)'})
  @ApiParam({name: 'id', type: Number, example: 1})
  @ApiResponse({status: 400, description: 'Projede task var.'})
  @ApiResponse({status: 404, description: 'Kayıt bulunamadı.'})
  @ApiResponse({status: 200, schema: projectsSchema})
  @Delete(':id') async remove(@Req() req: AuthRequest, @Param('id') id: string) {
    const user = allow(req, 'project.delete');
    const projectId = await this.store.reachable(user, idField(id));
    await this.store.transaction(async client => {
      if ((await client.query('SELECT t.id FROM tasks t JOIN columns c ON c.id=t."columnId" WHERE c."projectId"=$1 LIMIT 1', [projectId])).rowCount) {
        throw new BadRequestException('Önce projedeki task’ları silin.');
      }
      await client.query('DELETE FROM columns WHERE "projectId"=$1', [projectId]);
      if (!(await client.query('DELETE FROM projects WHERE id=$1', [projectId])).rowCount) throw new NotFoundException('Proje bulunamadı.');
    });
    return this.list(await this.store.projectIds(user));
  }
  @ApiOperation({summary: 'Proje üyelerini listele (project.view yetkisi)'})
  @ApiParam({name: 'id', type: Number, example: 1})
  @ApiResponse({status: 200, schema: usersSchema})
  @Get(':id/members') async members(@Req() req: AuthRequest, @Param('id') id: string) {
    const user = allow(req, 'project.view');
    const projectId = await this.store.reachable(user, idField(id));
    return this.memberList(projectId);
  }
  private async memberList(projectId: number) {
    return (await this.store.db.query(
      'SELECT u.id,u.name,u.surname,u.title,u.email,u.role,u.permissions,(u."avatarContent" IS NOT NULL) AS "hasAvatar" FROM users u JOIN project_members m ON m."userId"=u.id WHERE m."projectId"=$1 ORDER BY u.id',
      [projectId])).rows;
  }
  @ApiOperation({summary: 'Projeye üye ekle (project.update yetkisi)'})
  @ApiParam({name: 'id', type: Number, example: 1})
  @ApiBody({schema: memberSchema})
  @ApiResponse({status: 404, description: 'Kayıt bulunamadı.'})
  @ApiResponse({status: 201, schema: usersSchema})
  @Post(':id/members') async addMember(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    const user = allow(req, 'project.update');
    const projectId = await this.store.reachable(user, idField(id)), userId = idField(body.userId);
    if (!(await this.store.db.query('SELECT id FROM users WHERE id=$1', [userId])).rowCount) throw new NotFoundException('Kullanıcı bulunamadı.');
    await this.store.db.query('INSERT INTO project_members("projectId","userId") VALUES($1,$2) ON CONFLICT DO NOTHING', [projectId, userId]);
    return this.memberList(projectId);
  }
  @ApiOperation({summary: 'Projeden üye çıkar (project.update yetkisi)'})
  @ApiParam({name: 'id', type: Number, example: 1})
  @ApiParam({name: 'userId', type: Number, example: 2})
  @ApiResponse({status: 400, description: 'Üyeye atanmış task var.'})
  @ApiResponse({status: 200, schema: usersSchema})
  @Delete(':id/members/:userId') async removeMember(@Req() req: AuthRequest, @Param('id') id: string, @Param('userId') rawUserId: string) {
    const user = allow(req, 'project.update');
    const projectId = await this.store.reachable(user, idField(id)), userId = idField(rawUserId);
    // Üyelikten çıkan kişinin açık task’ları sahipsiz kalmasın diye önce atamalar çözülmeli.
    if ((await this.store.db.query('SELECT t.id FROM tasks t JOIN columns c ON c.id=t."columnId" WHERE c."projectId"=$1 AND t."assigneeId"=$2 LIMIT 1', [projectId, userId])).rowCount) {
      throw new BadRequestException('Bu üyeye atanmış task’lar var. Önce atamaları değiştirin.');
    }
    await this.store.db.query('DELETE FROM project_members WHERE "projectId"=$1 AND "userId"=$2', [projectId, userId]);
    return this.memberList(projectId);
  }
  @ApiOperation({summary: 'Projenin panosunu getir'})
  @ApiParam({name: 'id', type: Number, example: 1})
  @ApiResponse({status: 404, description: 'Proje bulunamadı.'})
  @ApiResponse({status: 200, schema: boardSchema})
  @Get(':id/board') async board(@Req() req: AuthRequest, @Param('id') id: string) {
    const user = current(req);
    const projectId = await this.store.reachable(user, idField(id));
    const board = await this.store.board(projectId);
    // task.view olmayan kullanıcı sütunları görür, task’ları görmez.
    return user.role === 'admin' || user.permissions?.['task.view'] === true ? board : {...board, tasks: []};
  }
}
