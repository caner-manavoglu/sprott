import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Inject, NotFoundException, Param, Patch, Post, Query, Req, Res, UploadedFile, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { basename } from 'node:path';
import { Store, can, idField, taskDates, textField, type User } from '../store.ts';
import { type AuthRequest, allow, current } from '../common/auth.ts';
import { boardSchema } from '../board/board.schemas.ts';
import { editTaskSchema, myTasksSchema, taskSchema, taskSearchSchema } from './tasks.schemas.ts';
import { taskTypes, type TaskType } from '../../shared/task-types.ts';
import { taskPriorities, type TaskPriority } from '../../shared/task-priorities.ts';

function taskType(value: unknown): TaskType {
  if (typeof value !== 'string' || !taskTypes.includes(value as TaskType)) throw new BadRequestException('Geçersiz task türü.');
  return value as TaskType;
}

function taskPriority(value: unknown): TaskPriority {
  if (typeof value !== 'string' || !taskPriorities.includes(value as TaskPriority)) throw new BadRequestException('Geçersiz öncelik.');
  return value as TaskPriority;
}

type Upload = {originalname: string; mimetype: string; size: number; buffer: Buffer};
const uploadOptions = {limits: {fileSize: 25 * 1024 * 1024}};

@ApiTags('Task’lar')
@ApiBearerAuth('bearer')
@ApiResponse({status: 401, description: 'Oturum gerekli.'})
@ApiResponse({status: 403, description: 'Yetki reddedildi.'})
@Controller('api/tasks')
export class TasksController {
  constructor(@Inject(Store) private store: Store) {}
  /** Sütunun projesine erişim kontrolü; task’lar her zaman bir projenin panosunda yaşar. */
  private async column(user: User, columnId: number) {
    return {columnId, projectId: await this.store.writable(user, await this.store.columnProject(columnId))};
  }
  /** Task yalnızca projenin üyesine atanabilir; null atamayı kaldırır. */
  private async assignee(projectId: number, value: unknown) {
    if (value === null || value === '') return null;
    const userId = idField(value);
    if (!(await this.store.db.query('SELECT 1 FROM project_members WHERE "projectId"=$1 AND "userId"=$2', [projectId, userId])).rowCount) {
      throw new BadRequestException('Task yalnızca proje üyelerine atanabilir.');
    }
    return userId;
  }
  /** Günlük kaydı için atanan kişinin adı; atanmamışsa null. */
  private async assigneeName(assigneeId: number | null) {
    if (assigneeId === null) return null;
    const row = (await this.store.db.query(
      `SELECT NULLIF(TRIM(CONCAT_WS(' ', name, surname)), '') AS name FROM users WHERE id=$1`, [assigneeId],
    )).rows[0] as {name: string | null} | undefined;
    return row?.name ?? null;
  }
  /** Sub-task aynı projedeki, kendisi sub-task olmayan bir ana task'a bağlanır. */
  private async parent(projectId: number, type: TaskType, value: unknown, taskId?: number) {
    if (type !== 'subtask') return null;
    if (value === null || value === '' || value === undefined) throw new BadRequestException('Sub-task için ana task seçmelisiniz.');
    const parentTaskId = idField(value);
    if (parentTaskId === taskId) throw new BadRequestException('Task kendisine bağlanamaz.');
    const parent = (await this.store.db.query(
      `SELECT 1 FROM tasks t JOIN columns c ON c.id=t."columnId"
       WHERE t.id=$1 AND c."projectId"=$2 AND t.type<>'subtask'`, [parentTaskId, projectId])).rowCount;
    if (!parent) throw new BadRequestException('Ana task aynı projede olmalı ve sub-task olmamalıdır.');
    if (taskId && (await this.store.db.query('SELECT 1 FROM tasks WHERE "parentTaskId"=$1 LIMIT 1', [taskId])).rowCount) {
      throw new BadRequestException('Alt taskları olan bir task, sub-task yapılamaz.');
    }
    return parentTaskId;
  }
  /**
   * Panoda taşıma kuralı: yöneticiler her task'ı her yöne taşır. Personel yalnızca kendi task'ını ileri taşır.
   * Grup yöneticisi, yönettiği grupların üyelerine ait task'ları ileri ve geri taşıyabilir.
   */
  private async allowMove(user: User, projectId: number, taskId: number, targetColumnId: number) {
    if (user.role === 'admin') return;
    const row = (await this.store.db.query(
      `SELECT t."assigneeId", t."columnId" AS "fromColumnId", COALESCE(source.position, source.id) AS "from", COALESCE(target.position, target.id) AS "to"
       FROM tasks t JOIN columns source ON source.id = t."columnId" JOIN columns target ON target.id = $2 WHERE t.id = $1`,
      [taskId, targetColumnId],
    )).rows[0] as {assigneeId: number|null; fromColumnId: number; from: number; to: number} | undefined;
    if (!row) throw new NotFoundException('Task bulunamadı.');
    if (row.to === row.from) return;
    // Proje akışı yöneticileri bağlamaz; personel ve grup yöneticisi tanımlı geçişlerin dışına çıkamaz.
    if (!await this.store.transitionAllowed(projectId, row.fromColumnId, targetColumnId)) {
      throw new ForbiddenException('Proje akışı bu sütun geçişine izin vermiyor.');
    }
    const managed = row.assigneeId !== null && !!(await this.store.db.query(
      `SELECT 1 FROM group_managers gm JOIN group_members m ON m."groupId" = gm."groupId"
       WHERE gm."userId" = $1 AND m."userId" = $2 LIMIT 1`,
      [user.id, row.assigneeId],
    )).rowCount;
    if (managed) return;
    if (row.assigneeId !== user.id) throw new ForbiddenException('Yalnızca kendinize atanmış task’ları taşıyabilirsiniz.');
    if (row.to < row.from) throw new ForbiddenException('Task’ı geri almak için grup yöneticisi olmanız gerekir.');
  }
  private async taskProject(taskId: number) {
    const row = (await this.store.db.query('SELECT c."projectId" FROM tasks t JOIN columns c ON c.id=t."columnId" WHERE t.id=$1', [taskId])).rows[0];
    if (!row) throw new NotFoundException('Task bulunamadı.');
    return row.projectId as number;
  }
  private file(file: Upload | undefined) {
    if (!file?.buffer?.length) throw new BadRequestException('Boş dosya yüklenemez.');
    return {
      name: textField(basename(file.originalname).replaceAll('\0', ''), 'Dosya adı', 255),
      mimeType: typeof file.mimetype === 'string' && file.mimetype.length <= 200 ? file.mimetype : 'application/octet-stream',
      size: file.size,
      content: file.buffer,
    };
  }
  private sendFile(response: Response, file: {name: string; mimeType: string; content: Buffer}) {
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.send(file.content);
  }
  private async mentionIds(projectId: number, value: unknown) {
    let raw = value;
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch { throw new BadRequestException('Etiketlenen kullanıcılar geçersiz.'); }
    }
    if (raw === undefined || raw === null) return [];
    if (!Array.isArray(raw)) throw new BadRequestException('Etiketlenen kullanıcılar geçersiz.');
    const ids = [...new Set(raw.map(idField))];
    if (ids.length && (await this.store.db.query(
      'SELECT "userId" FROM project_members WHERE "projectId"=$1 AND "userId"=ANY($2)', [projectId, ids],
    )).rowCount !== ids.length) throw new BadRequestException('Yalnızca proje kullanıcıları etiketlenebilir.');
    return ids;
  }
  private async ownedComment(req: AuthRequest, taskId: number, commentId: number) {
    const user = current(req), projectId = await this.store.writable(user, await this.taskProject(taskId));
    const comment = (await this.store.db.query(
      'SELECT "authorId" FROM task_comments WHERE id=$1 AND "taskId"=$2', [commentId, taskId],
    )).rows[0] as {authorId: number} | undefined;
    if (!comment) throw new NotFoundException('Yorum bulunamadı.');
    if (comment.authorId !== user.id) throw new ForbiddenException('Yalnızca kendi yorumunuzu değiştirebilirsiniz.');
    return projectId;
  }
  /** Task güncelleme yetkisi olanlar ile task'ı oluşturan kişi kendi eklerini yönetebilir. */
  private async attachmentChange(req: AuthRequest, taskId: number) {
    const user = current(req);
    const row = (await this.store.db.query(
      'SELECT t."createdBy",c."projectId" FROM tasks t JOIN columns c ON c.id=t."columnId" WHERE t.id=$1', [taskId],
    )).rows[0] as {createdBy: number; projectId: number} | undefined;
    if (!row) throw new NotFoundException('Task bulunamadı.');
    await this.store.writable(user, row.projectId);
    if (!can(user, 'task.update') && !(can(user, 'task.create') && row.createdBy === user.id)) {
      throw new ForbiddenException('Task güncelleme yetkiniz bulunmuyor.');
    }
    return row.projectId;
  }
  @ApiOperation({summary: 'Bana atanan task’lar (task.view yetkisi)'})
  @ApiResponse({status: 200, schema: myTasksSchema})
  @Get('mine') async mine(@Req() req: AuthRequest) {
    const user = allow(req, 'task.view');
    const projectIds = await this.store.projectIds(user);
    if (!projectIds.length) return [];
    // Tamamlanan sütun (projenin son sütunu) listede yer almaz; bitmiş iş "yapılacak" değildir.
    return (await this.store.db.query(
      `SELECT t.id, t.title, t.type, t.priority, t."startDate", t."dueDate",
         t."columnId", c.name AS "columnName", p.id AS "projectId", p.name AS "projectName"
       FROM tasks t
       JOIN columns c ON c.id=t."columnId"
       JOIN projects p ON p.id=c."projectId"
       WHERE p.id = ANY($1) AND t."assigneeId"=$2
         AND c.position < (SELECT MAX(position) FROM columns WHERE "projectId"=p.id)
       ORDER BY t."dueDate" IS NULL, t."dueDate", t.id DESC`,
      [projectIds, user.id],
    )).rows;
  }
  @ApiOperation({summary: 'Task ara (task.view yetkisi)'})
  @ApiQuery({name: 'q', required: true, description: 'Task adı ve açıklamasında büyük/küçük harf duyarsız arama; en az iki karakter.', example: 'giriş'})
  @ApiResponse({status: 200, schema: taskSearchSchema})
  @Get() async search(@Req() req: AuthRequest, @Query('q') q?: string) {
    const user = allow(req, 'task.view');
    const term = typeof q === 'string' ? q.trim() : '';
    // Tek harflik aramalar tüm panoyu döndüreceği için sonuçsuz bırakılır.
    if (term.length < 2) return [];
    const projectIds = await this.store.projectIds(user);
    if (!projectIds.length) return [];
    // ILIKE joker karakterleri kullanıcı metninde kaçırılır, yoksa '%' tüm kayıtları eşler.
    const pattern = `%${term.replace(/[\\%_]/g, character => `\\${character}`)}%`;
    return (await this.store.db.query(
      `SELECT t.id, t.title, t.type, t.priority, t."columnId", c.name AS "columnName",
         p.id AS "projectId", p.name AS "projectName"
       FROM tasks t JOIN columns c ON c.id=t."columnId" JOIN projects p ON p.id=c."projectId"
       WHERE p.id = ANY($1) AND (t.title ILIKE $2 OR t.description ILIKE $2)
       ORDER BY t.id DESC LIMIT 20`,
      [projectIds, pattern],
    )).rows;
  }
  @ApiOperation({summary: 'Task oluştur (task.create yetkisi)'})
  @ApiBody({schema: taskSchema})
  @ApiResponse({status: 400, description: 'Geçersiz istek.'})
  @ApiResponse({status: 201, schema: boardSchema})
  @Post() async create(@Req() req: AuthRequest, @Body() body: Record<string, unknown>) {
    const user = allow(req, 'task.create');
    const title = textField(body.title, 'Task adı', 160), description = textField(body.description, 'Açıklama', 5000);
    const {columnId, projectId} = await this.column(user, idField(body.columnId));
    const assigneeId = await this.assignee(projectId, body.assigneeId ?? null);
    const {startDate, dueDate} = taskDates(body.startDate, body.dueDate);
    const type = taskType(body.type === undefined ? 'task' : body.type);
    const priority = taskPriority(body.priority === undefined ? 'normal' : body.priority);
    const parentTaskId = await this.parent(projectId, type, body.parentTaskId);
    const createdTaskId = (await this.store.db.query(
      'INSERT INTO tasks(title,description,"columnId","createdBy","assigneeId","startDate","dueDate",type,"parentTaskId",priority) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',
      [title, description, columnId, user.id, assigneeId, startDate, dueDate, type, parentTaskId, priority])).rows[0].id as number;
    await this.store.notify([assigneeId], 'assigned', createdTaskId, user.id);
    // Günlükte "kim açtı" `actorName`'den gelir; "kime atadı" ayrıntı sütununa yazılır.
    await this.store.log({
      projectId, taskId: createdTaskId, taskTitle: title, action: 'task.create',
      detail: `Atanan: ${await this.assigneeName(assigneeId) ?? 'yok'}`, actor: user,
    });
    return {...await this.store.board(projectId), createdTaskId};
  }
  @Post(':id/attachments')
  @UseInterceptors(FilesInterceptor('files', undefined, uploadOptions))
  async addAttachments(@Req() req: AuthRequest, @Param('id') id: string, @UploadedFiles() uploads: Upload[] | undefined) {
    const taskId = idField(id), projectId = await this.attachmentChange(req, taskId);
    if (!uploads?.length) throw new BadRequestException('En az bir dosya seçmelisiniz.');
    await this.store.transaction(async client => {
      for (const upload of uploads) {
        const file = this.file(upload);
        await client.query(
          'INSERT INTO task_attachments("taskId",name,"mimeType",size,content) VALUES($1,$2,$3,$4,$5)',
          [taskId, file.name, file.mimeType, file.size, file.content],
        );
      }
    });
    return this.store.board(projectId);
  }
  @Patch(':id/attachments/:attachmentId')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  async replaceAttachment(@Req() req: AuthRequest, @Param('id') id: string, @Param('attachmentId') attachmentIdValue: string,
    @UploadedFile() upload: Upload | undefined) {
    const taskId = idField(id), attachmentId = idField(attachmentIdValue), projectId = await this.attachmentChange(req, taskId);
    const file = this.file(upload);
    if (!(await this.store.db.query(
      'UPDATE task_attachments SET name=$1,"mimeType"=$2,size=$3,content=$4,"updatedAt"=NOW() WHERE id=$5 AND "taskId"=$6',
      [file.name, file.mimeType, file.size, file.content, attachmentId, taskId],
    )).rowCount) throw new NotFoundException('Dosya bulunamadı.');
    return this.store.board(projectId);
  }
  @Delete(':id/attachments/:attachmentId')
  async deleteAttachment(@Req() req: AuthRequest, @Param('id') id: string, @Param('attachmentId') attachmentIdValue: string) {
    const taskId = idField(id), attachmentId = idField(attachmentIdValue), projectId = await this.attachmentChange(req, taskId);
    if (!(await this.store.db.query('DELETE FROM task_attachments WHERE id=$1 AND "taskId"=$2', [attachmentId, taskId])).rowCount) {
      throw new NotFoundException('Dosya bulunamadı.');
    }
    return this.store.board(projectId);
  }
  @Get(':id/attachments/:attachmentId')
  async attachment(@Req() req: AuthRequest, @Res() response: Response, @Param('id') id: string, @Param('attachmentId') attachmentIdValue: string) {
    const user = allow(req, 'task.view'), taskId = idField(id), attachmentId = idField(attachmentIdValue);
    await this.store.reachable(user, await this.taskProject(taskId));
    const file = (await this.store.db.query(
      'SELECT name,"mimeType",content FROM task_attachments WHERE id=$1 AND "taskId"=$2', [attachmentId, taskId],
    )).rows[0] as {name: string; mimeType: string; content: Buffer} | undefined;
    if (!file) throw new NotFoundException('Dosya bulunamadı.');
    this.sendFile(response, file);
  }
  @Post(':id/comments')
  @UseInterceptors(FilesInterceptor('files', undefined, uploadOptions))
  async addComment(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: Record<string, unknown>,
    @UploadedFiles() uploads: Upload[] | undefined) {
    const user = allow(req, 'task.view'), taskId = idField(id);
    const projectId = await this.store.writable(user, await this.taskProject(taskId));
    const comment = textField(body.body, 'Yorum', 5000), mentions = await this.mentionIds(projectId, body.mentions);
    await this.store.transaction(async client => {
      const commentId = (await client.query(
        'INSERT INTO task_comments("taskId","authorId",body) VALUES($1,$2,$3) RETURNING id', [taskId, user.id, comment],
      )).rows[0].id as number;
      for (const userId of mentions) await client.query(
        'INSERT INTO task_comment_mentions("commentId","userId") VALUES($1,$2)', [commentId, userId],
      );
      for (const upload of uploads ?? []) {
        const file = this.file(upload);
        await client.query(
          'INSERT INTO task_comment_attachments("commentId",name,"mimeType",size,content) VALUES($1,$2,$3,$4,$5)',
          [commentId, file.name, file.mimeType, file.size, file.content],
        );
      }
    });
    const task = (await this.store.db.query('SELECT "assigneeId", title FROM tasks WHERE id=$1', [taskId])).rows[0] as {assigneeId: number|null; title: string} | undefined;
    const assigneeId = task?.assigneeId ?? null;
    // Etiketlenene "mention", task'ın sahibine "comment"; ikisi aynı kişiyse yalnızca etiket bildirimi kalır.
    await this.store.notify(mentions, 'mention', taskId, user.id);
    if (!mentions.includes(assigneeId as number)) await this.store.notify([assigneeId], 'comment', taskId, user.id);
    await this.store.log({projectId, taskId, taskTitle: task?.title ?? `#${taskId}`, action: 'comment.create', actor: user});
    return this.store.board(projectId);
  }
  // Yorum düzenlenirken gönderilen dosyalar mevcut eklerin üstüne eklenir.
  @Patch(':id/comments/:commentId')
  @UseInterceptors(FilesInterceptor('files', undefined, uploadOptions))
  async updateComment(@Req() req: AuthRequest, @Param('id') id: string, @Param('commentId') commentIdValue: string,
    @Body() body: Record<string, unknown>, @UploadedFiles() uploads: Upload[] | undefined) {
    const taskId = idField(id), commentId = idField(commentIdValue), projectId = await this.ownedComment(req, taskId, commentId);
    const comment = textField(body.body, 'Yorum', 5000), mentions = await this.mentionIds(projectId, body.mentions);
    // Düzenlemede yalnızca yeni eklenen etiketler bildirilir; eskiler zaten haber almıştı.
    const known = (await this.store.db.query('SELECT "userId" FROM task_comment_mentions WHERE "commentId"=$1', [commentId])).rows.map(row => row.userId as number);
    await this.store.transaction(async client => {
      await client.query('UPDATE task_comments SET body=$1,"updatedAt"=NOW() WHERE id=$2', [comment, commentId]);
      await client.query('DELETE FROM task_comment_mentions WHERE "commentId"=$1', [commentId]);
      for (const userId of mentions) await client.query(
        'INSERT INTO task_comment_mentions("commentId","userId") VALUES($1,$2)', [commentId, userId],
      );
      for (const upload of uploads ?? []) {
        const file = this.file(upload);
        await client.query(
          'INSERT INTO task_comment_attachments("commentId",name,"mimeType",size,content) VALUES($1,$2,$3,$4,$5)',
          [commentId, file.name, file.mimeType, file.size, file.content],
        );
      }
    });
    await this.store.notify(mentions.filter(userId => !known.includes(userId)), 'mention', taskId, current(req).id);
    return this.store.board(projectId);
  }
  // Yanlış eklenen dosya düzenleme sırasında geri alınabilsin diye tek tek silinir.
  @Delete(':id/comments/:commentId/attachments/:attachmentId')
  async deleteCommentAttachment(@Req() req: AuthRequest, @Param('id') id: string,
    @Param('commentId') commentIdValue: string, @Param('attachmentId') attachmentIdValue: string) {
    const taskId = idField(id), commentId = idField(commentIdValue), attachmentId = idField(attachmentIdValue);
    const projectId = await this.ownedComment(req, taskId, commentId);
    if (!(await this.store.db.query(
      'DELETE FROM task_comment_attachments WHERE id=$1 AND "commentId"=$2', [attachmentId, commentId],
    )).rowCount) throw new NotFoundException('Dosya bulunamadı.');
    return this.store.board(projectId);
  }
  @Delete(':id/comments/:commentId')
  async deleteComment(@Req() req: AuthRequest, @Param('id') id: string, @Param('commentId') commentIdValue: string) {
    const taskId = idField(id), commentId = idField(commentIdValue), projectId = await this.ownedComment(req, taskId, commentId);
    await this.store.db.query('DELETE FROM task_comments WHERE id=$1', [commentId]);
    return this.store.board(projectId);
  }
  @Get(':id/comments/:commentId/attachments/:attachmentId')
  async commentAttachment(@Req() req: AuthRequest, @Res() response: Response, @Param('id') id: string,
    @Param('commentId') commentIdValue: string, @Param('attachmentId') attachmentIdValue: string) {
    const user = allow(req, 'task.view'), taskId = idField(id), commentId = idField(commentIdValue), attachmentId = idField(attachmentIdValue);
    await this.store.reachable(user, await this.taskProject(taskId));
    const file = (await this.store.db.query(
      `SELECT ca.name,ca."mimeType",ca.content FROM task_comment_attachments ca
       JOIN task_comments cm ON cm.id=ca."commentId" WHERE ca.id=$1 AND cm.id=$2 AND cm."taskId"=$3`,
      [attachmentId, commentId, taskId],
    )).rows[0] as {name: string; mimeType: string; content: Buffer} | undefined;
    if (!file) throw new NotFoundException('Dosya bulunamadı.');
    this.sendFile(response, file);
  }
  @ApiOperation({summary: 'Task’ı güncelle (sütun, başlık, açıklama veya atanan kişi)'})
  @ApiParam({name: 'id', type: Number, example: 1})
  @ApiBody({schema: editTaskSchema})
  @ApiResponse({status: 400, description: 'Geçersiz istek.'})
  @ApiResponse({status: 404, description: 'Kayıt bulunamadı.'})
  @ApiResponse({status: 200, schema: boardSchema})
  @Patch(':id') async update(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    const user = allow(req, 'task.update'), taskId = idField(id);
    let projectId = await this.store.writable(user, await this.taskProject(taskId));
    // Bildirim için önceki durum: atanan kişi değişti mi, task tamamlandı sütununa mı taşındı.
    const before = (await this.store.db.query(
      `SELECT t."assigneeId", t."columnId", t.title, c.name AS "columnName"
       FROM tasks t JOIN columns c ON c.id=t."columnId" WHERE t.id=$1`, [taskId],
    )).rows[0] as {assigneeId: number|null; columnId: number; title: string; columnName: string} | undefined;
    if (!before) throw new NotFoundException('Task bulunamadı.');
    const sets: string[] = [], values: unknown[] = [];
    if (body.type !== undefined || body.parentTaskId !== undefined) {
      const saved = (await this.store.db.query('SELECT type,"parentTaskId" FROM tasks WHERE id=$1', [taskId])).rows[0] as {type: TaskType; parentTaskId: number|null};
      const type = body.type === undefined ? saved.type : taskType(body.type);
      const parentTaskId = await this.parent(projectId, type, body.parentTaskId === undefined ? saved.parentTaskId : body.parentTaskId, taskId);
      values.push(type); sets.push(`type=$${values.length}`);
      values.push(parentTaskId); sets.push(`"parentTaskId"=$${values.length}`);
    }
    if (body.columnId !== undefined) {
      const target = await this.column(user, idField(body.columnId));
      // Task’lar projeler arasında taşınmaz; hedef sütun aynı panoda olmalı.
      if (target.projectId !== projectId) throw new BadRequestException('Task yalnızca kendi projesinin sütunlarına taşınabilir.');
      await this.allowMove(user, projectId, taskId, target.columnId);
      values.push(target.columnId); sets.push(`"columnId"=$${values.length}`);
    }
    if (body.priority !== undefined) { values.push(taskPriority(body.priority)); sets.push(`priority=$${values.length}`); }
    if (body.title !== undefined) { values.push(textField(body.title, 'Task adı', 160)); sets.push(`title=$${values.length}`); }
    if (body.description !== undefined) { values.push(textField(body.description, 'Açıklama', 5000)); sets.push(`description=$${values.length}`); }
    if (body.assigneeId !== undefined) { values.push(await this.assignee(projectId, body.assigneeId)); sets.push(`"assigneeId"=$${values.length}`); }
    if (body.startDate !== undefined || body.dueDate !== undefined) {
      // Tek tarih gönderilse de çift olarak doğrulanır; eksik olan kayıttaki değerden tamamlanır.
      const saved = (await this.store.db.query(
        `SELECT to_char("startDate", 'YYYY-MM-DD') AS "startDate", to_char("dueDate", 'YYYY-MM-DD') AS "dueDate" FROM tasks WHERE id=$1`, [taskId],
      )).rows[0] as {startDate: string|null; dueDate: string|null} | undefined;
      if (!saved) throw new NotFoundException('Task bulunamadı.');
      // Bir ay sınırı yalnızca başlangıç gerçekten değiştiğinde işler; eski task'lar olduğu gibi kaydedilebilir.
      const dates = taskDates(
        body.startDate === undefined ? saved.startDate : body.startDate,
        body.dueDate === undefined ? saved.dueDate : body.dueDate,
        body.startDate !== undefined && body.startDate !== saved.startDate,
      );
      values.push(dates.startDate); sets.push(`"startDate"=$${values.length}`);
      values.push(dates.dueDate); sets.push(`"dueDate"=$${values.length}`);
    }
    if (!sets.length) throw new BadRequestException('Güncellenecek alan gönderilmedi.');
    values.push(taskId);
    if (!(await this.store.db.query(`UPDATE tasks SET ${sets.join(',')} WHERE id=$${values.length}`, values)).rowCount) throw new NotFoundException('Task bulunamadı.');
    const after = (await this.store.db.query('SELECT "assigneeId","columnId" FROM tasks WHERE id=$1', [taskId])).rows[0] as {assigneeId: number|null; columnId: number};
    if (after.assigneeId !== before.assigneeId) {
      await this.store.notify([after.assigneeId], 'assigned', taskId, user.id);
      // Atama değişimi sütun değişiminden ayrı bir kayıttır; ikisi aynı istekte olabilir.
      await this.store.log({
        projectId, taskId, taskTitle: before.title, action: 'task.assign',
        detail: `${await this.assigneeName(before.assigneeId) ?? 'yok'} → ${await this.assigneeName(after.assigneeId) ?? 'yok'}`,
        actor: user,
      });
    }
    if (after.columnId !== before.columnId && await this.store.isFinalColumn(projectId, after.columnId)) {
      await this.store.notify(await this.store.managerIds(after.assigneeId), 'completed', taskId, user.id);
    }
    // Günlüğe yalnızca statü (sütun) değişimi yazılır; metin düzenlemeleri kayda girmez.
    if (after.columnId !== before.columnId) {
      const target = (await this.store.db.query('SELECT name FROM columns WHERE id=$1', [after.columnId])).rows[0] as {name: string} | undefined;
      // Not yalnızca son (tamamlandı) sütuna taşımalarda düşer; arayüzdeki uyarı da
      // aynı koşulla çıkar, böylece günlükteki not "uyarı geçildi" anlamını korur.
      const openPrs = await this.store.isFinalColumn(projectId, after.columnId)
        ? (await this.store.db.query(
            `SELECT 1 FROM pull_request_tasks prt JOIN pull_requests pr ON pr.id=prt."pullRequestId"
             WHERE prt."taskId"=$1 AND pr.state='open'`, [taskId],
          )).rowCount ?? 0
        : 0;
      await this.store.log({
        projectId, taskId, taskTitle: before.title, action: 'task.move',
        detail: `${before.columnName} → ${target?.name ?? '?'}${openPrs ? ` · ${openPrs} açık PR` : ''}`, actor: user,
      });
    }
    return this.store.board(projectId);
  }
  @ApiOperation({summary: 'Task sil (task.delete yetkisi)'})
  @ApiParam({name: 'id', type: Number, example: 1})
  @ApiResponse({status: 404, description: 'Kayıt bulunamadı.'})
  @ApiResponse({status: 200, schema: boardSchema})
  @Delete(':id') async remove(@Req() req: AuthRequest, @Param('id') id: string) {
    const user = allow(req, 'task.delete'), taskId = idField(id);
    const projectId = await this.store.writable(user, await this.taskProject(taskId));
    if ((await this.store.db.query('SELECT 1 FROM tasks WHERE "parentTaskId"=$1 LIMIT 1', [taskId])).rowCount) {
      throw new BadRequestException('Alt taskları bulunan ana task silinemez.');
    }
    // Ad silmeden önce alınır; günlük kaydı task gittikten sonra da okunabilir olmalı.
    const removed = (await this.store.db.query('SELECT title FROM tasks WHERE id=$1', [taskId])).rows[0] as {title: string} | undefined;
    if (!(await this.store.db.query('DELETE FROM tasks WHERE id=$1', [taskId])).rowCount) throw new NotFoundException('Task bulunamadı.');
    await this.store.log({projectId, taskId: null, taskTitle: removed?.title ?? `#${taskId}`, action: 'task.delete', actor: user});
    return this.store.board(projectId);
  }
}
