import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { basename } from 'node:path';
import { taskPriorities, type TaskPriority } from '../../shared/task-priorities.ts';
import { taskTypes, type TaskType } from '../../shared/task-types.ts';
import { allow, current, type AuthRequest } from '../common/auth.ts';
import { can, idField, taskDates, textField, type User } from '../common/fields.ts';
import type { Prisma } from '../generated/prisma/client.ts';
import { dbDate } from '../prisma/dates.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { sql } from '../prisma/sql.ts';
import { WorkspaceService } from '../workspace/workspace.service.ts';
import { type CreateTaskDto, type TaskCommentDto, type UpdateTaskDto } from './dto/tasks.dto.ts';

function taskType(value: unknown): TaskType {
  if (typeof value !== 'string' || !taskTypes.includes(value as TaskType)) throw new BadRequestException('Geçersiz task türü.');
  return value as TaskType;
}
function taskPriority(value: unknown): TaskPriority {
  if (typeof value !== 'string' || !taskPriorities.includes(value as TaskPriority)) throw new BadRequestException('Geçersiz öncelik.');
  return value as TaskPriority;
}
type Upload = { originalname: string; mimetype: string; size: number; buffer: Buffer };

@Injectable()
export class TasksService {
  constructor(@Inject(WorkspaceService) private workspace: WorkspaceService, @Inject(PrismaService) private prisma: PrismaService) { }
  private async column(user: User, columnId: number) {
    return { columnId, projectId: await this.workspace.writable(user, await this.workspace.columnProject(columnId)) };
  }
  private async assignee(projectId: number, value: unknown) {
    if (value === null || value === '') return null;
    const userId = idField(value);
    if (!(await this.prisma.projectMember.count({ where: { projectId, userId }, }))) {
      throw new BadRequestException('Task yalnızca proje üyelerine atanabilir.');
    }
    return userId;
  }
  private async assigneeName(assigneeId: number | null) {
    if (assigneeId === null) return null;
    const row = (await sql(this.prisma,
      `SELECT NULLIF(TRIM(CONCAT_WS(' ', name, surname)), '') AS name FROM users WHERE id=$1`, [assigneeId],
    )).rows[0] as { name: string | null } | undefined;
    return row?.name ?? null;
  }
  private async parent(projectId: number, type: TaskType, value: unknown, taskId?: number) {
    if (type !== 'subtask') return null;
    if (value === null || value === '' || value === undefined) throw new BadRequestException('Sub-task için ana task seçmelisiniz.');
    const parentTaskId = idField(value);
    if (parentTaskId === taskId) throw new BadRequestException('Task kendisine bağlanamaz.');
    const parent = (await sql(this.prisma,
      `SELECT 1 FROM tasks t JOIN columns c ON c.id=t."columnId"
       WHERE t.id=$1 AND c."projectId"=$2 AND t.type<>'subtask'`, [parentTaskId, projectId])).rowCount;
    if (!parent) throw new BadRequestException('Ana task aynı projede olmalı ve sub-task olmamalıdır.');
    if (taskId && (await this.prisma.task.count({ where: { parentTaskId: taskId }, }))) {
      throw new BadRequestException('Alt taskları olan bir task, sub-task yapılamaz.');
    }
    return parentTaskId;
  }
  private async allowMove(user: User, projectId: number, taskId: number, targetColumnId: number) {
    if (user.role === 'admin') return;
    const row = (await sql(this.prisma,
      `SELECT t."assigneeId", t."columnId" AS "fromColumnId", COALESCE(source.position, source.id) AS "from", COALESCE(target.position, target.id) AS "to"
       FROM tasks t JOIN columns source ON source.id = t."columnId" JOIN columns target ON target.id = $2 WHERE t.id = $1`,
      [taskId, targetColumnId],
    )).rows[0] as { assigneeId: number | null; fromColumnId: number; from: number; to: number } | undefined;
    if (!row) throw new NotFoundException('Task bulunamadı.');
    if (row.to === row.from) return;
    // Proje akışı yöneticileri bağlamaz; personel ve grup yöneticisi tanımlı geçişlerin dışına çıkamaz.
    if (!await this.workspace.transitionAllowed(projectId, row.fromColumnId, targetColumnId)) {
      throw new ForbiddenException('Proje akışı bu sütun geçişine izin vermiyor.');
    }
    const managed = row.assigneeId !== null && !!(await sql(this.prisma,
      `SELECT 1 FROM group_managers gm JOIN group_members m ON m."groupId" = gm."groupId"
       WHERE gm."userId" = $1 AND m."userId" = $2 LIMIT 1`,
      [user.id, row.assigneeId],
    )).rowCount;
    if (managed) return;
    if (row.assigneeId !== user.id) throw new ForbiddenException('Yalnızca kendinize atanmış task’ları taşıyabilirsiniz.');
    if (row.to < row.from) throw new ForbiddenException('Task’ı geri almak için grup yöneticisi olmanız gerekir.');
  }
  private async taskProject(taskId: number) {
    const row = (await sql(this.prisma, 'SELECT c."projectId" FROM tasks t JOIN columns c ON c.id=t."columnId" WHERE t.id=$1', [taskId])).rows[0];
    if (!row) throw new NotFoundException('Task bulunamadı.');
    return row.projectId as number;
  }
  private file(file: Upload | undefined) {
    if (!file?.buffer?.length) throw new BadRequestException('Boş dosya yüklenemez.');
    return {
      name: textField(basename(file.originalname).replaceAll('\0', ''), 'Dosya adı', 255),
      mimeType: typeof file.mimetype === 'string' && file.mimetype.length <= 200 ? file.mimetype : 'application/octet-stream',
      size: file.size,
      content: new Uint8Array(file.buffer),
    };
  }
  private sendFile(response: Response, file: { name: string; mimeType: string; content: Uint8Array }) {
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.send(Buffer.from(file.content));
  }
  private async mentionIds(projectId: number, value: unknown) {
    let raw = value;
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch { throw new BadRequestException('Etiketlenen kullanıcılar geçersiz.'); }
    }
    if (raw === undefined || raw === null) return [];
    if (!Array.isArray(raw)) throw new BadRequestException('Etiketlenen kullanıcılar geçersiz.');
    const ids = [...new Set(raw.map(idField))];
    if (ids.length && (await this.prisma.projectMember.count({ where: { projectId, userId: { in: ids } }, })) !== ids.length) throw new BadRequestException('Yalnızca proje kullanıcıları etiketlenebilir.');
    return ids;
  }
  private async ownedComment(req: AuthRequest, taskId: number, commentId: number) {
    const user = current(req), projectId = await this.workspace.writable(user, await this.taskProject(taskId));
    const comment = (await this.prisma.taskComment.findFirst({ where: { id: commentId, taskId }, select: { authorId: true }, })) as { authorId: number } | undefined;
    if (!comment) throw new NotFoundException('Yorum bulunamadı.');
    if (comment.authorId !== user.id) throw new ForbiddenException('Yalnızca kendi yorumunuzu değiştirebilirsiniz.');
    return projectId;
  }
  private async attachmentChange(req: AuthRequest, taskId: number) {
    const user = current(req);
    const row = (await sql(this.prisma,
      'SELECT t."createdBy",c."projectId" FROM tasks t JOIN columns c ON c.id=t."columnId" WHERE t.id=$1', [taskId],
    )).rows[0] as { createdBy: number; projectId: number } | undefined;
    if (!row) throw new NotFoundException('Task bulunamadı.');
    await this.workspace.writable(user, row.projectId);
    if (!can(user, 'task.update') && !(can(user, 'task.create') && row.createdBy === user.id)) {
      throw new ForbiddenException('Task güncelleme yetkiniz bulunmuyor.');
    }
    return row.projectId;
  }
  async mine(req: AuthRequest) {
    const user = allow(req, 'task.view');
    const projectIds = await this.workspace.projectIds(user);
    if (!projectIds.length) return [];
    // Tamamlanan sütun (projenin son sütunu) listede yer almaz; bitmiş iş "yapılacak" değildir.
    return (await sql(this.prisma,
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
  async search(req: AuthRequest, q?: string) {
    const user = allow(req, 'task.view');
    const term = typeof q === 'string' ? q.trim() : '';
    // Tek harflik aramalar tüm panoyu döndüreceği için sonuçsuz bırakılır.
    if (term.length < 2) return [];
    const projectIds = await this.workspace.projectIds(user);
    if (!projectIds.length) return [];
    // ILIKE joker karakterleri kullanıcı metninde kaçırılır, yoksa '%' tüm kayıtları eşler.
    const pattern = `%${term.replace(/[\\%_]/g, character => `\\${character}`)}%`;
    return (await sql(this.prisma,
      `SELECT t.id, t.title, t.type, t.priority, t."columnId", c.name AS "columnName",
         p.id AS "projectId", p.name AS "projectName"
       FROM tasks t JOIN columns c ON c.id=t."columnId" JOIN projects p ON p.id=c."projectId"
       WHERE p.id = ANY($1) AND (t.title ILIKE $2 OR t.description ILIKE $2)
       ORDER BY t.id DESC LIMIT 20`,
      [projectIds, pattern],
    )).rows;
  }
  async create(req: AuthRequest, body: CreateTaskDto) {
    const user = allow(req, 'task.create');
    const title = textField(body.title, 'Task adı', 160), description = textField(body.description, 'Açıklama', 5000);
    const { columnId, projectId } = await this.column(user, idField(body.columnId));
    const assigneeId = await this.assignee(projectId, body.assigneeId ?? null);
    const { startDate, dueDate } = taskDates(body.startDate, body.dueDate);
    const type = taskType(body.type === undefined ? 'task' : body.type);
    const priority = taskPriority(body.priority === undefined ? 'normal' : body.priority);
    const parentTaskId = await this.parent(projectId, type, body.parentTaskId);
    const createdTaskId = (await this.prisma.task.create({ data: { title, description, columnId, createdBy: user.id, assigneeId, startDate: dbDate(startDate), dueDate: dbDate(dueDate), type, parentTaskId, priority }, select: { id: true } })).id as number;
    await this.workspace.notify([assigneeId], 'assigned', createdTaskId, user.id);
    // Günlükte "kim açtı" `actorName`'den gelir; "kime atadı" ayrıntı sütununa yazılır.
    await this.workspace.log({
      projectId, taskId: createdTaskId, taskTitle: title, action: 'task.create',
      detail: `Atanan: ${await this.assigneeName(assigneeId) ?? 'yok'}`, actor: user,
    });
    return { ...await this.workspace.board(projectId), createdTaskId };
  }
  async addAttachments(req: AuthRequest, id: string, uploads: Upload[] | undefined) {
    const taskId = idField(id), projectId = await this.attachmentChange(req, taskId);
    if (!uploads?.length) throw new BadRequestException('En az bir dosya seçmelisiniz.');
    await this.workspace.transaction(async client => {
      for (const upload of uploads) {
        const file = this.file(upload);
        await client.taskAttachment.create({ data: { taskId, name: file.name, mimeType: file.mimeType, size: file.size, content: new Uint8Array(file.content) } });
      }
    });
    return this.workspace.board(projectId);
  }
  async replaceAttachment(req: AuthRequest, id: string, attachmentIdValue: string, upload: Upload | undefined) {
    const taskId = idField(id), attachmentId = idField(attachmentIdValue), projectId = await this.attachmentChange(req, taskId);
    const file = this.file(upload);
    if (!((await this.prisma.taskAttachment.updateMany({ where: { id: attachmentId, taskId }, data: { name: file.name, mimeType: file.mimeType, size: file.size, content: new Uint8Array(file.content), updatedAt: new Date() } })).count)) throw new NotFoundException('Dosya bulunamadı.');
    return this.workspace.board(projectId);
  }
  async deleteAttachment(req: AuthRequest, id: string, attachmentIdValue: string) {
    const taskId = idField(id), attachmentId = idField(attachmentIdValue), projectId = await this.attachmentChange(req, taskId);
    if (!((await this.prisma.taskAttachment.deleteMany({ where: { id: attachmentId, taskId }, })).count)) {
      throw new NotFoundException('Dosya bulunamadı.');
    }
    return this.workspace.board(projectId);
  }
  async attachment(req: AuthRequest, response: Response, id: string, attachmentIdValue: string) {
    const user = allow(req, 'task.view'), taskId = idField(id), attachmentId = idField(attachmentIdValue);
    await this.workspace.reachable(user, await this.taskProject(taskId));
    const file = (await this.prisma.taskAttachment.findFirst({ where: { id: attachmentId, taskId }, select: { name: true, mimeType: true, content: true }, })) as { name: string; mimeType: string; content: Buffer } | undefined;
    if (!file) throw new NotFoundException('Dosya bulunamadı.');
    this.sendFile(response, file);
  }
  async addComment(req: AuthRequest, id: string, body: TaskCommentDto, uploads: Upload[] | undefined) {
    const user = allow(req, 'task.view'), taskId = idField(id);
    const projectId = await this.workspace.writable(user, await this.taskProject(taskId));
    const comment = textField(body.body, 'Yorum', 5000), mentions = await this.mentionIds(projectId, body.mentions);
    await this.workspace.transaction(async client => {
      const commentId = (await client.taskComment.create({ data: { taskId, authorId: user.id, body: comment }, select: { id: true } })).id as number;
      for (const userId of mentions) (await client.taskCommentMention.create({ data: { commentId, userId } }));
      for (const upload of uploads ?? []) {
        const file = this.file(upload);
        await client.taskCommentAttachment.create({ data: { commentId, name: file.name, mimeType: file.mimeType, size: file.size, content: new Uint8Array(file.content) } });
      }
    });
    const task = (await this.prisma.task.findFirst({ where: { id: taskId }, select: { assigneeId: true, title: true }, })) as { assigneeId: number | null; title: string } | undefined;
    const assigneeId = task?.assigneeId ?? null;
    // Etiketlenene "mention", task'ın sahibine "comment"; ikisi aynı kişiyse yalnızca etiket bildirimi kalır.
    await this.workspace.notify(mentions, 'mention', taskId, user.id);
    if (!mentions.includes(assigneeId as number)) await this.workspace.notify([assigneeId], 'comment', taskId, user.id);
    await this.workspace.log({ projectId, taskId, taskTitle: task?.title ?? `#${taskId}`, action: 'comment.create', actor: user });
    return this.workspace.board(projectId);
  }
  async updateComment(req: AuthRequest, id: string, commentIdValue: string, body: TaskCommentDto, uploads: Upload[] | undefined) {
    const taskId = idField(id), commentId = idField(commentIdValue), projectId = await this.ownedComment(req, taskId, commentId);
    const comment = textField(body.body, 'Yorum', 5000), mentions = await this.mentionIds(projectId, body.mentions);
    // Düzenlemede yalnızca yeni eklenen etiketler bildirilir; eskiler zaten haber almıştı.
    const known = (await this.prisma.taskCommentMention.findMany({ where: { commentId }, select: { userId: true }, })).map(row => row.userId as number);
    await this.workspace.transaction(async client => {
      await client.taskComment.updateMany({ where: { id: commentId }, data: { body: comment, updatedAt: new Date() } });
      await client.taskCommentMention.deleteMany({ where: { commentId }, });
      for (const userId of mentions) (await client.taskCommentMention.create({ data: { commentId, userId } }));
      for (const upload of uploads ?? []) {
        const file = this.file(upload);
        await client.taskCommentAttachment.create({ data: { commentId, name: file.name, mimeType: file.mimeType, size: file.size, content: new Uint8Array(file.content) } });
      }
    });
    await this.workspace.notify(mentions.filter(userId => !known.includes(userId)), 'mention', taskId, current(req).id);
    return this.workspace.board(projectId);
  }
  async deleteCommentAttachment(req: AuthRequest, id: string, commentIdValue: string, attachmentIdValue: string) {
    const taskId = idField(id), commentId = idField(commentIdValue), attachmentId = idField(attachmentIdValue);
    const projectId = await this.ownedComment(req, taskId, commentId);
    if (!((await this.prisma.taskCommentAttachment.deleteMany({ where: { id: attachmentId, commentId }, })).count)) throw new NotFoundException('Dosya bulunamadı.');
    return this.workspace.board(projectId);
  }
  async deleteComment(req: AuthRequest, id: string, commentIdValue: string) {
    const taskId = idField(id), commentId = idField(commentIdValue), projectId = await this.ownedComment(req, taskId, commentId);
    await this.prisma.taskComment.deleteMany({ where: { id: commentId }, });
    return this.workspace.board(projectId);
  }
  async commentAttachment(req: AuthRequest, response: Response, id: string, commentIdValue: string, attachmentIdValue: string) {
    const user = allow(req, 'task.view'), taskId = idField(id), commentId = idField(commentIdValue), attachmentId = idField(attachmentIdValue);
    await this.workspace.reachable(user, await this.taskProject(taskId));
    const file = (await sql(this.prisma,
      `SELECT ca.name,ca."mimeType",ca.content FROM task_comment_attachments ca
       JOIN task_comments cm ON cm.id=ca."commentId" WHERE ca.id=$1 AND cm.id=$2 AND cm."taskId"=$3`,
      [attachmentId, commentId, taskId],
    )).rows[0] as { name: string; mimeType: string; content: Buffer } | undefined;
    if (!file) throw new NotFoundException('Dosya bulunamadı.');
    this.sendFile(response, file);
  }
  async update(req: AuthRequest, id: string, body: UpdateTaskDto) {
    const user = allow(req, 'task.update'), taskId = idField(id);
    let projectId = await this.workspace.writable(user, await this.taskProject(taskId));
    // Bildirim için önceki durum: atanan kişi değişti mi, task tamamlandı sütununa mı taşındı.
    const before = (await sql(this.prisma,
      `SELECT t."assigneeId", t."columnId", t.title, c.name AS "columnName"
       FROM tasks t JOIN columns c ON c.id=t."columnId" WHERE t.id=$1`, [taskId],
    )).rows[0] as { assigneeId: number | null; columnId: number; title: string; columnName: string } | undefined;
    if (!before) throw new NotFoundException('Task bulunamadı.');
    const data: Prisma.TaskUncheckedUpdateManyInput = {};
    if (body.type !== undefined || body.parentTaskId !== undefined) {
      const saved = (await this.prisma.task.findFirst({ where: { id: taskId }, select: { type: true, parentTaskId: true }, })) as { type: TaskType; parentTaskId: number | null };
      const type = body.type === undefined ? saved.type : taskType(body.type);
      const parentTaskId = await this.parent(projectId, type, body.parentTaskId === undefined ? saved.parentTaskId : body.parentTaskId, taskId);
      data.type = type;
      data.parentTaskId = parentTaskId;
    }
    if (body.columnId !== undefined) {
      const target = await this.column(user, idField(body.columnId));
      // Task’lar projeler arasında taşınmaz; hedef sütun aynı panoda olmalı.
      if (target.projectId !== projectId) throw new BadRequestException('Task yalnızca kendi projesinin sütunlarına taşınabilir.');
      await this.allowMove(user, projectId, taskId, target.columnId);
      data.columnId = target.columnId;
    }
    if (body.priority !== undefined) { data.priority = taskPriority(body.priority); }
    if (body.title !== undefined) { data.title = textField(body.title, 'Task adı', 160); }
    if (body.description !== undefined) { data.description = textField(body.description, 'Açıklama', 5000); }
    if (body.assigneeId !== undefined) { data.assigneeId = await this.assignee(projectId, body.assigneeId); }
    if (body.startDate !== undefined || body.dueDate !== undefined) {
      // Tek tarih gönderilse de çift olarak doğrulanır; eksik olan kayıttaki değerden tamamlanır.
      const saved = (await sql(this.prisma,
        `SELECT to_char("startDate", 'YYYY-MM-DD') AS "startDate", to_char("dueDate", 'YYYY-MM-DD') AS "dueDate" FROM tasks WHERE id=$1`, [taskId],
      )).rows[0] as { startDate: string | null; dueDate: string | null } | undefined;
      if (!saved) throw new NotFoundException('Task bulunamadı.');
      // Bir ay sınırı yalnızca başlangıç gerçekten değiştiğinde işler; eski task'lar olduğu gibi kaydedilebilir.
      const dates = taskDates(
        body.startDate === undefined ? saved.startDate : body.startDate,
        body.dueDate === undefined ? saved.dueDate : body.dueDate,
        body.startDate !== undefined && body.startDate !== saved.startDate,
      );
      data.startDate = dbDate(dates.startDate);
      data.dueDate = dbDate(dates.dueDate);
    }
    if (!Object.keys(data).length) throw new BadRequestException('Güncellenecek alan gönderilmedi.');
    if (!(await this.prisma.task.updateMany({ where: { id: taskId }, data })).count) throw new NotFoundException('Task bulunamadı.');
    const after = (await this.prisma.task.findFirst({ where: { id: taskId }, select: { assigneeId: true, columnId: true }, })) as { assigneeId: number | null; columnId: number };
    if (after.assigneeId !== before.assigneeId) {
      await this.workspace.notify([after.assigneeId], 'assigned', taskId, user.id);
      // Atama değişimi sütun değişiminden ayrı bir kayıttır; ikisi aynı istekte olabilir.
      await this.workspace.log({
        projectId, taskId, taskTitle: before.title, action: 'task.assign',
        detail: `${await this.assigneeName(before.assigneeId) ?? 'yok'} → ${await this.assigneeName(after.assigneeId) ?? 'yok'}`,
        actor: user,
      });
    }
    if (after.columnId !== before.columnId && await this.workspace.isFinalColumn(projectId, after.columnId)) {
      await this.workspace.notify(await this.workspace.managerIds(after.assigneeId), 'completed', taskId, user.id);
    }
    // Günlüğe yalnızca statü (sütun) değişimi yazılır; metin düzenlemeleri kayda girmez.
    if (after.columnId !== before.columnId) {
      const target = (await this.prisma.column.findFirst({ where: { id: after.columnId }, select: { name: true }, })) as { name: string } | undefined;
      // Not yalnızca son (tamamlandı) sütuna taşımalarda düşer; arayüzdeki uyarı da
      // aynı koşulla çıkar, böylece günlükteki not "uyarı geçildi" anlamını korur.
      const openPrs = await this.workspace.isFinalColumn(projectId, after.columnId)
        ? (await sql(this.prisma,
          `SELECT 1 FROM pull_request_tasks prt JOIN pull_requests pr ON pr.id=prt."pullRequestId"
             WHERE prt."taskId"=$1 AND pr.state='open'`, [taskId],
        )).rowCount ?? 0
        : 0;
      await this.workspace.log({
        projectId, taskId, taskTitle: before.title, action: 'task.move',
        detail: `${before.columnName} → ${target?.name ?? '?'}${openPrs ? ` · ${openPrs} açık PR` : ''}`, actor: user,
      });
    }
    return this.workspace.board(projectId);
  }
  async remove(req: AuthRequest, id: string) {
    const user = allow(req, 'task.delete'), taskId = idField(id);
    const projectId = await this.workspace.writable(user, await this.taskProject(taskId));
    if ((await this.prisma.task.count({ where: { parentTaskId: taskId }, }))) {
      throw new BadRequestException('Alt taskları bulunan ana task silinemez.');
    }
    // Ad silmeden önce alınır; günlük kaydı task gittikten sonra da okunabilir olmalı.
    const removed = (await this.prisma.task.findFirst({ where: { id: taskId }, select: { title: true }, })) as { title: string } | undefined;
    if (!((await this.prisma.task.deleteMany({ where: { id: taskId }, })).count)) throw new NotFoundException('Task bulunamadı.');
    await this.workspace.log({ projectId, taskId: null, taskTitle: removed?.title ?? `#${taskId}`, action: 'task.delete', actor: user });
    return this.workspace.board(projectId);
  }
}
