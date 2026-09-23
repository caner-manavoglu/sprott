import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { allow } from '../common/auth.ts';
import { TODAY, idField, type User } from '../common/fields.ts';
import type { Prisma } from '../generated/prisma/client.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { query } from '../prisma/sql.ts';
import { AccessService } from '../workspace/access.service.ts';
import { ActivityLogService } from '../workspace/activity-log.service.ts';
import { type CreatePullRequestDto, type PullRequestStateDto, type UpdatePullRequestDto } from './dto/pull-requests.dto.ts';

type PrState = 'open' | 'merged' | 'closed';

@Injectable()
export class PullRequestsService {
  constructor(
    @Inject(AccessService) private access: AccessService,
    @Inject(ActivityLogService) private activity: ActivityLogService,
    @Inject(PrismaService) private prisma: PrismaService,
  ) { }
  private async taskIds(projectId: number, ids: number[] | null | undefined) {
    if (!ids?.length) return [];
    const found = await this.prisma.task.count({ where: { id: { in: ids }, column: { projectId } } });
    if (found !== ids.length) throw new BadRequestException('Task’lar PR ile aynı projede olmalı.');
    return ids;
  }
  private async linked(pullRequestId: bigint) {
    return (await this.prisma.pullRequestTask.findMany({ where: { pullRequestId }, select: { taskId: true } })).map(row => row.taskId);
  }
  private view(value?: string) { return value === undefined || value === '' ? undefined : idField(value); }
  private async writablePr(user: User, pullRequestId: number) {
    const row = await this.prisma.pullRequest.findUnique({ where: { id: BigInt(pullRequestId) }, select: { id: true, projectId: true, url: true, title: true, state: true } });
    if (!row) throw new NotFoundException('PR bulunamadı.');
    await this.access.writable(user, row.projectId);
    return { ...row, state: row.state as PrState };
  }
  private async logForTasks(projectId: number, taskIds: number[], action: 'pr.link' | 'pr.unlink' | 'pr.merge', detail: string, actor: User) {
    if (!taskIds.length) return;
    const rows = await this.prisma.task.findMany({ where: { id: { in: taskIds } }, select: { id: true, title: true } });
    for (const task of rows) {
      await this.activity.log({ projectId, taskId: task.id, taskTitle: task.title, action, detail, actor });
    }
  }
  private rows(projectIds: number[]) {
    return query(this.prisma, `
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
      WHERE pr."projectId" = ANY($1)
      -- Bekleyenler üstte, her grupta en eski önce: en uzun bekleyen ilk sırada.
      ORDER BY (pr.state <> 'open'), pr."createdAt", pr.id`, [projectIds]);
  }
  private async feed(user: User, requested?: number) {
    const reachable = await this.access.projectIds(user);
    const projects = reachable.length
      ? await this.prisma.project.findMany({ where: { id: { in: reachable } }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
      : [];
    if (!projects.length) return { projects: [], projectId: null, rows: [] };
    // Erişimi olmayan bir proje istenirse süzme yok sayılır; veri sızmaz, liste tümüne düşer.
    const projectId = requested !== undefined && reachable.includes(requested) ? requested : null;
    return { projects, projectId, rows: await this.rows(projectId === null ? reachable : [projectId]) };
  }
  async index(user: User, projectId?: string) {
    allow(user, 'pr.view');
    return this.feed(user, this.view(projectId));
  }
  async linkable(user: User, projectId: string) {
    allow(user, 'pr.view');
    const id = await this.access.reachable(user, idField(projectId));
    return this.prisma.task.findMany({ where: { column: { projectId: id } }, select: { id: true, title: true }, orderBy: { id: 'desc' } });
  }
  async create(user: User, body: CreatePullRequestDto, view?: string) {
    allow(user, 'pr.create');
    // Tamamlanmış projede pano dondurulur; PR eklemek de bir pano değişikliğidir.
    const projectId = await this.access.writable(user, body.projectId);
    const { url, title } = body;
    const taskIds = await this.taskIds(projectId, body.taskIds);
    const created = await this.prisma.pullRequest.create({
      data: { projectId, url, title, description: body.description ?? '', createdBy: user.id, tasks: { create: taskIds.map(taskId => ({ taskId })) } },
      select: { id: true },
    }).then(row => row.id).catch((error: { code?: string }) => {
      if (error.code === 'P2002') throw new BadRequestException('Bu PR bu projeye zaten eklenmiş.');
      throw error;
    });
    await this.logForTasks(projectId, taskIds, 'pr.link', `PR bağlandı: ${title}`, user);
    // Yazma sonrası liste tüm projelere düşer; ekran kendi filtresini yeniden uygular.
    return { ...await this.feed(user, this.view(view)), createdPullRequestId: created.toString() };
  }
  async update(user: User, id: number, body: UpdatePullRequestDto, view?: string) {
    allow(user, 'pr.update');
    const pullRequest = await this.writablePr(user, id);
    const data: Prisma.PullRequestUpdateInput = {};
    if (body.url !== undefined) data.url = body.url;
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    // Bağ listesi gönderilirse tamamen değiştirilir; günlüğe yalnızca fark yazılır.
    const before = await this.linked(pullRequest.id);
    const after = body.taskIds === undefined ? before : await this.taskIds(pullRequest.projectId, body.taskIds);
    if (!Object.keys(data).length && body.taskIds === undefined) throw new BadRequestException('Güncellenecek alan gönderilmedi.');
    await this.prisma.$transaction(async client => {
      if (Object.keys(data).length) {
        await client.pullRequest.update({ where: { id: pullRequest.id }, data: { ...data, updatedAt: new Date() } });
      }
      if (body.taskIds !== undefined) {
        await client.pullRequestTask.deleteMany({ where: { pullRequestId: pullRequest.id } });
        await client.pullRequestTask.createMany({ data: after.map(taskId => ({ pullRequestId: pullRequest.id, taskId })) });
      }
    }).catch((error: { code?: string }) => {
      if (error.code === 'P2002') throw new BadRequestException('Bu PR bu projeye zaten eklenmiş.');
      throw error;
    });
    const title = body.title ?? pullRequest.title;
    await this.logForTasks(pullRequest.projectId, after.filter(taskId => !before.includes(taskId)), 'pr.link', `PR bağlandı: ${title}`, user);
    await this.logForTasks(pullRequest.projectId, before.filter(taskId => !after.includes(taskId)), 'pr.unlink', `PR bağı kaldırıldı: ${title}`, user);
    return this.feed(user, this.view(view));
  }
  async setState(user: User, id: number, body: PullRequestStateDto, view?: string) {
    allow(user, 'pr.merge');
    const pullRequest = await this.writablePr(user, id);
    const { state } = body;
    // 'merged' dışına çıkıldığında onay bilgisi temizlenir; yanlış işaretleme geri alınabilir.
    await this.prisma.pullRequest.update({
      where: { id: pullRequest.id }, data: {
        state, mergedAt: state === 'merged' ? new Date() : null, mergedBy: state === 'merged' ? user.id : null, updatedAt: new Date(),
      }
    });
    if (state === 'merged' && pullRequest.state !== 'merged') {
      await this.logForTasks(pullRequest.projectId, await this.linked(pullRequest.id), 'pr.merge', `PR onaylandı: ${pullRequest.title}`, user);
    }
    return this.feed(user, this.view(view));
  }
  async remove(user: User, id: number, view?: string) {
    allow(user, 'pr.delete');
    const pullRequest = await this.writablePr(user, id);
    const linked = await this.linked(pullRequest.id);
    await this.prisma.pullRequest.deleteMany({ where: { id: pullRequest.id } });
    await this.logForTasks(pullRequest.projectId, linked, 'pr.unlink', `PR silindi: ${pullRequest.title}`, user);
    return this.feed(user, this.view(view));
  }
}
