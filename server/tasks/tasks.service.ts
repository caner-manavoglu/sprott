import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { basename } from 'node:path';
import { type TaskType } from '../../shared/task-types.ts';
import { allow } from '../common/auth.ts';
import { can, taskDates, textField, type User } from '../common/fields.ts';
import type { Prisma } from '../generated/prisma/client.ts';
import { dbDate } from '../prisma/dates.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { query } from '../prisma/sql.ts';
import { AccessService } from '../workspace/access.service.ts';
import { ActivityLogService } from '../workspace/activity-log.service.ts';
import { NotifierService } from '../workspace/notifier.service.ts';
import { WorkspaceService } from '../workspace/workspace.service.ts';
import { type CreateTaskDto, type TaskCommentDto, type UpdateTaskDto } from './dto/tasks.dto.ts';

type Upload = { originalname: string; mimetype: string; size: number; buffer: Buffer };

@Injectable()
export class TasksService {
  constructor(
    @Inject(WorkspaceService) private workspace: WorkspaceService,
    @Inject(AccessService) private access: AccessService,
    @Inject(NotifierService) private notifier: NotifierService,
    @Inject(ActivityLogService) private activity: ActivityLogService,
    @Inject(PrismaService) private prisma: PrismaService,
  ) { }
  private async column(user: User, columnId: number) {
    return { columnId, projectId: await this.access.writable(user, await this.access.columnProject(columnId)) };
  }
  private async assignee(projectId: number, userId: number | null) {
    if (userId === null) return null;
    if (!(await this.prisma.projectMember.count({ where: { projectId, userId } }))) {
      throw new BadRequestException('Task yalnızca proje üyelerine atanabilir.');
    }
    return userId;
  }
  private async assigneeName(assigneeId: number | null) {
    if (assigneeId === null) return null;
    const row = await this.prisma.user.findUnique({ where: { id: assigneeId }, select: { name: true, surname: true } });
    return row ? `${row.name} ${row.surname}`.trim() || null : null;
  }
  private async parent(projectId: number, type: TaskType, parentTaskId: number | null | undefined, taskId?: number) {
    if (type !== 'subtask') return null;
    if (parentTaskId === null || parentTaskId === undefined) throw new BadRequestException('Sub-task için ana task seçmelisiniz.');
    if (parentTaskId === taskId) throw new BadRequestException('Task kendisine bağlanamaz.');
    const parent = await this.prisma.task.count({ where: { id: parentTaskId, column: { projectId }, type: { not: 'subtask' } } });
    if (!parent) throw new BadRequestException('Ana task aynı projede olmalı ve sub-task olmamalıdır.');
    if (taskId && (await this.prisma.task.count({ where: { parentTaskId: taskId } }))) {
      throw new BadRequestException('Alt taskları olan bir task, sub-task yapılamaz.');
    }
    return parentTaskId;
  }
  private async allowMove(user: User, projectId: number, taskId: number, targetColumnId: number) {
    if (user.role === 'admin') return;
    const row = (await query<{ assigneeId: number | null; fromColumnId: number; from: number; to: number }>(this.prisma,
      `SELECT t."assigneeId", t."columnId" AS "fromColumnId", COALESCE(source.position, source.id) AS "from", COALESCE(target.position, target.id) AS "to"
       FROM tasks t JOIN columns source ON source.id = t."columnId" JOIN columns target ON target.id = $2 WHERE t.id = $1`,
      [taskId, targetColumnId],
    ))[0];
    if (!row) throw new NotFoundException('Task bulunamadı.');
    if (row.to === row.from) return;
    // Proje akışı yöneticileri bağlamaz; personel ve grup yöneticisi tanımlı geçişlerin dışına çıkamaz.
    if (!await this.workspace.transitionAllowed(projectId, row.fromColumnId, targetColumnId)) {
      throw new ForbiddenException('Proje akışı bu sütun geçişine izin vermiyor.');
    }
    const managed = row.assigneeId !== null && !!(await this.prisma.groupManager.count({
      where: { userId: user.id, group: { members: { some: { userId: row.assigneeId } } } },
    }));
    if (managed) return;
    if (row.assigneeId !== user.id) throw new ForbiddenException('Yalnızca kendinize atanmış task’ları taşıyabilirsiniz.');
    if (row.to < row.from) throw new ForbiddenException('Task’ı geri almak için grup yöneticisi olmanız gerekir.');
  }
  // ponytail: ekler PostgreSQL bytea'da tutulur (25 MB'a kadar); DB boyutu sorun olunca içerik diske/S3'e, tabloda yalnızca anahtar.
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
  private async checkMentions(projectId: number, ids: number[]) {
    if (ids.length && (await this.prisma.projectMember.count({ where: { projectId, userId: { in: ids } } })) !== ids.length) {
      throw new BadRequestException('Yalnızca proje kullanıcıları etiketlenebilir.');
    }
    return ids;
  }
  private async ownedComment(user: User, taskId: number, commentId: number) {
    const projectId = await this.access.writable(user, await this.access.taskProject(taskId));
    const comment = await this.prisma.taskComment.findFirst({ where: { id: commentId, taskId }, select: { authorId: true } });
    if (!comment) throw new NotFoundException('Yorum bulunamadı.');
    if (comment.authorId !== user.id) throw new ForbiddenException('Yalnızca kendi yorumunuzu değiştirebilirsiniz.');
    return projectId;
  }
  private async attachmentChange(user: User, taskId: number) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId }, select: { createdBy: true, column: { select: { projectId: true } } } });
    if (!task) throw new NotFoundException('Task bulunamadı.');
    await this.access.writable(user, task.column.projectId);
    if (!can(user, 'task.update') && !(can(user, 'task.create') && task.createdBy === user.id)) {
      throw new ForbiddenException('Task güncelleme yetkiniz bulunmuyor.');
    }
    return task.column.projectId;
  }
  async mine(user: User) {
    allow(user, 'task.view');
    const projectIds = await this.access.projectIds(user);
    if (!projectIds.length) return [];
    // Tamamlanan sütun (projenin son sütunu) listede yer almaz; bitmiş iş "yapılacak" değildir.
    return query(this.prisma,
      `SELECT t.id, t.title, t.type, t.priority, t."startDate", t."dueDate",
         t."columnId", c.name AS "columnName", p.id AS "projectId", p.name AS "projectName"
       FROM tasks t
       JOIN columns c ON c.id=t."columnId"
       JOIN projects p ON p.id=c."projectId"
       WHERE p.id = ANY($1) AND t."assigneeId"=$2
         AND c.position < (SELECT MAX(position) FROM columns WHERE "projectId"=p.id)
       ORDER BY t."dueDate" IS NULL, t."dueDate", t.id DESC`,
      [projectIds, user.id],
    );
  }
  async search(user: User, q?: string) {
    allow(user, 'task.view');
    const term = typeof q === 'string' ? q.trim() : '';
    // Tek harflik aramalar tüm panoyu döndüreceği için sonuçsuz bırakılır.
    if (term.length < 2) return [];
    const projectIds = await this.access.projectIds(user);
    if (!projectIds.length) return [];
    // ILIKE joker karakterleri kullanıcı metninde kaçırılır, yoksa '%' tüm kayıtları eşler.
    const pattern = `%${term.replace(/[\\%_]/g, character => `\\${character}`)}%`;
    return query(this.prisma,
      `SELECT t.id, t.title, t.type, t.priority, t."columnId", c.name AS "columnName",
         p.id AS "projectId", p.name AS "projectName"
       FROM tasks t JOIN columns c ON c.id=t."columnId" JOIN projects p ON p.id=c."projectId"
       WHERE p.id = ANY($1) AND (t.title ILIKE $2 OR t.description ILIKE $2)
       ORDER BY t.id DESC LIMIT 20`,
      [projectIds, pattern],
    );
  }
  async create(user: User, body: CreateTaskDto) {
    allow(user, 'task.create');
    const { columnId, projectId } = await this.column(user, body.columnId);
    const assigneeId = await this.assignee(projectId, body.assigneeId ?? null);
    const { startDate, dueDate } = taskDates(body.startDate ?? null, body.dueDate ?? null);
    const parentTaskId = await this.parent(projectId, body.type, body.parentTaskId);
    const createdTaskId = (await this.prisma.task.create({
      data: { title: body.title, description: body.description, columnId, createdBy: user.id, assigneeId, startDate: dbDate(startDate), dueDate: dbDate(dueDate), type: body.type, parentTaskId, priority: body.priority },
      select: { id: true },
    })).id;
    await this.notifier.notify([assigneeId], 'assigned', createdTaskId, user.id);
    // Günlükte "kim açtı" `actorName`'den gelir; "kime atadı" ayrıntı sütununa yazılır.
    await this.activity.log({
      projectId, taskId: createdTaskId, taskTitle: body.title, action: 'task.create',
      detail: `Atanan: ${await this.assigneeName(assigneeId) ?? 'yok'}`, actor: user,
    });
    return { ...await this.workspace.board(projectId), createdTaskId };
  }
  async addAttachments(user: User, taskId: number, uploads: Upload[] | undefined) {
    const projectId = await this.attachmentChange(user, taskId);
    if (!uploads?.length) throw new BadRequestException('En az bir dosya seçmelisiniz.');
    const files = uploads.map(upload => this.file(upload));
    await this.prisma.taskAttachment.createMany({ data: files.map(file => ({ taskId, ...file })) });
    return this.workspace.board(projectId);
  }
  async replaceAttachment(user: User, taskId: number, attachmentId: number, upload: Upload | undefined) {
    const projectId = await this.attachmentChange(user, taskId);
    const file = this.file(upload);
    if (!(await this.prisma.taskAttachment.updateMany({ where: { id: attachmentId, taskId }, data: { ...file, updatedAt: new Date() } })).count) {
      throw new NotFoundException('Dosya bulunamadı.');
    }
    return this.workspace.board(projectId);
  }
  async deleteAttachment(user: User, taskId: number, attachmentId: number) {
    const projectId = await this.attachmentChange(user, taskId);
    if (!(await this.prisma.taskAttachment.deleteMany({ where: { id: attachmentId, taskId } })).count) {
      throw new NotFoundException('Dosya bulunamadı.');
    }
    return this.workspace.board(projectId);
  }
  async attachment(user: User, response: Response, taskId: number, attachmentId: number) {
    allow(user, 'task.view');
    await this.access.reachable(user, await this.access.taskProject(taskId));
    const file = await this.prisma.taskAttachment.findFirst({ where: { id: attachmentId, taskId }, select: { name: true, mimeType: true, content: true } });
    if (!file) throw new NotFoundException('Dosya bulunamadı.');
    this.sendFile(response, file);
  }
  /** Task yorumları; pano yükünü hafif tutmak için task açıldığında ayrıca istenir. */
  async comments(user: User, taskId: number) {
    allow(user, 'task.view');
    await this.access.reachable(user, await this.access.taskProject(taskId));
    return this.commentList(taskId);
  }
  private commentList(taskId: number) {
    return query(this.prisma, `
      SELECT cm.id, cm.body, cm."authorId",
        NULLIF(TRIM(CONCAT_WS(' ', author.name, author.surname)), '') AS "authorName",
        (author."avatarContent" IS NOT NULL) AS "authorHasAvatar",
        cm."createdAt", cm."updatedAt",
        COALESCE((SELECT json_agg(json_build_object(
          'id', mentioned.id, 'name', NULLIF(TRIM(CONCAT_WS(' ', mentioned.name, mentioned.surname)), '')
        ) ORDER BY mentioned.name, mentioned.surname, mentioned.id)
          FROM task_comment_mentions mention JOIN users mentioned ON mentioned.id=mention."userId"
          WHERE mention."commentId"=cm.id), '[]') AS mentions,
        COALESCE((SELECT json_agg(json_build_object(
          'id', ca.id, 'name', ca.name, 'mimeType', ca."mimeType", 'size', ca.size
        ) ORDER BY ca.id) FROM task_comment_attachments ca WHERE ca."commentId"=cm.id), '[]') AS attachments
      FROM task_comments cm JOIN users author ON author.id=cm."authorId"
      WHERE cm."taskId"=$1 ORDER BY cm."createdAt", cm.id`, [taskId]);
  }
  async addComment(user: User, taskId: number, body: TaskCommentDto, uploads: Upload[] | undefined) {
    allow(user, 'task.view');
    const projectId = await this.access.writable(user, await this.access.taskProject(taskId));
    const mentions = await this.checkMentions(projectId, body.mentions);
    const files = (uploads ?? []).map(upload => this.file(upload));
    await this.prisma.taskComment.create({
      data: {
        taskId, authorId: user.id, body: body.body,
        mentions: { create: mentions.map(userId => ({ userId })) },
        attachments: { create: files },
      },
    });
    const task = await this.prisma.task.findUnique({ where: { id: taskId }, select: { assigneeId: true, title: true } });
    const assigneeId = task?.assigneeId ?? null;
    // Etiketlenene "mention", task'ın sahibine "comment"; ikisi aynı kişiyse yalnızca etiket bildirimi kalır.
    await this.notifier.notify(mentions, 'mention', taskId, user.id);
    if (assigneeId === null || !mentions.includes(assigneeId)) await this.notifier.notify([assigneeId], 'comment', taskId, user.id);
    await this.activity.log({ projectId, taskId, taskTitle: task?.title ?? `#${taskId}`, action: 'comment.create', actor: user });
    return this.commentList(taskId);
  }
  async updateComment(user: User, taskId: number, commentId: number, body: TaskCommentDto, uploads: Upload[] | undefined) {
    const projectId = await this.ownedComment(user, taskId, commentId);
    const mentions = await this.checkMentions(projectId, body.mentions);
    const files = (uploads ?? []).map(upload => this.file(upload));
    // Düzenlemede yalnızca yeni eklenen etiketler bildirilir; eskiler zaten haber almıştı.
    const known = (await this.prisma.taskCommentMention.findMany({ where: { commentId }, select: { userId: true } })).map(row => row.userId);
    await this.prisma.taskComment.update({
      where: { id: commentId },
      data: {
        body: body.body, updatedAt: new Date(),
        mentions: { deleteMany: {}, create: mentions.map(userId => ({ userId })) },
        attachments: { create: files },
      },
    });
    await this.notifier.notify(mentions.filter(userId => !known.includes(userId)), 'mention', taskId, user.id);
    return this.commentList(taskId);
  }
  async deleteCommentAttachment(user: User, taskId: number, commentId: number, attachmentId: number) {
    await this.ownedComment(user, taskId, commentId);
    if (!(await this.prisma.taskCommentAttachment.deleteMany({ where: { id: attachmentId, commentId } })).count) throw new NotFoundException('Dosya bulunamadı.');
    return this.commentList(taskId);
  }
  async deleteComment(user: User, taskId: number, commentId: number) {
    await this.ownedComment(user, taskId, commentId);
    await this.prisma.taskComment.deleteMany({ where: { id: commentId } });
    return this.commentList(taskId);
  }
  async commentAttachment(user: User, response: Response, taskId: number, commentId: number, attachmentId: number) {
    allow(user, 'task.view');
    await this.access.reachable(user, await this.access.taskProject(taskId));
    const file = await this.prisma.taskCommentAttachment.findFirst({
      where: { id: attachmentId, commentId, taskComment: { taskId } }, select: { name: true, mimeType: true, content: true },
    });
    if (!file) throw new NotFoundException('Dosya bulunamadı.');
    this.sendFile(response, file);
  }
  async update(user: User, taskId: number, body: UpdateTaskDto) {
    allow(user, 'task.update');
    const projectId = await this.access.writable(user, await this.access.taskProject(taskId));
    // Bildirim için önceki durum: atanan kişi değişti mi, task tamamlandı sütununa mı taşındı.
    const before = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { assigneeId: true, columnId: true, title: true, type: true, parentTaskId: true, startDate: true, dueDate: true, column: { select: { name: true } } },
    });
    if (!before) throw new NotFoundException('Task bulunamadı.');
    const data: Prisma.TaskUncheckedUpdateInput = {};
    if (body.type !== undefined || body.parentTaskId !== undefined) {
      const type = body.type ?? before.type as TaskType;
      data.type = type;
      data.parentTaskId = await this.parent(projectId, type, body.parentTaskId === undefined ? before.parentTaskId : body.parentTaskId, taskId);
    }
    if (body.columnId !== undefined) {
      const target = await this.column(user, body.columnId);
      // Task’lar projeler arasında taşınmaz; hedef sütun aynı panoda olmalı.
      if (target.projectId !== projectId) throw new BadRequestException('Task yalnızca kendi projesinin sütunlarına taşınabilir.');
      await this.allowMove(user, projectId, taskId, target.columnId);
      data.columnId = target.columnId;
    }
    if (body.priority !== undefined) data.priority = body.priority;
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.assigneeId !== undefined) data.assigneeId = await this.assignee(projectId, body.assigneeId);
    if (body.startDate !== undefined || body.dueDate !== undefined) {
      // Tek tarih gönderilse de çift olarak doğrulanır; eksik olan kayıttaki değerden tamamlanır.
      const saved = { startDate: before.startDate?.toISOString().slice(0, 10) ?? null, dueDate: before.dueDate?.toISOString().slice(0, 10) ?? null };
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
    const after = await this.prisma.task.update({ where: { id: taskId }, data, select: { assigneeId: true, columnId: true, column: { select: { name: true } } } });
    if (after.assigneeId !== before.assigneeId) {
      await this.notifier.notify([after.assigneeId], 'assigned', taskId, user.id);
      // Atama değişimi sütun değişiminden ayrı bir kayıttır; ikisi aynı istekte olabilir.
      await this.activity.log({
        projectId, taskId, taskTitle: before.title, action: 'task.assign',
        detail: `${await this.assigneeName(before.assigneeId) ?? 'yok'} → ${await this.assigneeName(after.assigneeId) ?? 'yok'}`,
        actor: user,
      });
    }
    // Günlüğe yalnızca statü (sütun) değişimi yazılır; metin düzenlemeleri kayda girmez.
    if (after.columnId !== before.columnId) {
      const completed = await this.workspace.isFinalColumn(projectId, after.columnId);
      if (completed) await this.notifier.notify(await this.notifier.managerIds(after.assigneeId), 'completed', taskId, user.id);
      // Not yalnızca son (tamamlandı) sütuna taşımalarda düşer; arayüzdeki uyarı da
      // aynı koşulla çıkar, böylece günlükteki not "uyarı geçildi" anlamını korur.
      const openPrs = completed ? await this.prisma.pullRequestTask.count({ where: { taskId, pullRequest: { state: 'open' } } }) : 0;
      await this.activity.log({
        projectId, taskId, taskTitle: before.title, action: 'task.move',
        detail: `${before.column.name} → ${after.column.name}${openPrs ? ` · ${openPrs} açık PR` : ''}`, actor: user,
      });
    }
    return this.workspace.board(projectId);
  }
  async remove(user: User, taskId: number) {
    allow(user, 'task.delete');
    const projectId = await this.access.writable(user, await this.access.taskProject(taskId));
    if (await this.prisma.task.count({ where: { parentTaskId: taskId } })) {
      throw new BadRequestException('Alt taskları bulunan ana task silinemez.');
    }
    // Ad silmeden önce alınır; günlük kaydı task gittikten sonra da okunabilir olmalı.
    const removed = await this.prisma.task.findUnique({ where: { id: taskId }, select: { title: true } });
    if (!(await this.prisma.task.deleteMany({ where: { id: taskId } })).count) throw new NotFoundException('Task bulunamadı.');
    await this.activity.log({ projectId, taskId: null, taskTitle: removed?.title ?? `#${taskId}`, action: 'task.delete', actor: user });
    return this.workspace.board(projectId);
  }
}
