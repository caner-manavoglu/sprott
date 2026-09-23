import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { allow, type AuthRequest } from '../common/auth.ts';
import { TODAY, idField, textField, type User } from '../common/fields.ts';
import type { Prisma } from '../generated/prisma/client.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { sql } from '../prisma/sql.ts';
import { WorkspaceService } from '../workspace/workspace.service.ts';
import { type CreatePullRequestDto, type PullRequestStateDto, type UpdatePullRequestDto } from './dto/pull-requests.dto.ts';

type PrState = 'open' | 'merged' | 'closed';
const STATES: PrState[] = ['open', 'merged', 'closed'];

@Injectable()
export class PullRequestsService {
  constructor(@Inject(WorkspaceService) private workspace: WorkspaceService, @Inject(PrismaService) private prisma: PrismaService) { }
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
  private async taskIds(projectId: number, value: unknown) {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) throw new BadRequestException('Task listesi geçersiz.');
    const ids = [...new Set(value.map(idField))];
    if (!ids.length) return [];
    const found = (await sql(this.prisma,
      `SELECT t.id FROM tasks t JOIN columns c ON c.id=t."columnId" WHERE t.id = ANY($1) AND c."projectId"=$2`,
      [ids, projectId],
    )).rowCount;
    if (found !== ids.length) throw new BadRequestException('Task’lar PR ile aynı projede olmalı.');
    return ids;
  }
  private view(value?: string) { return value === undefined || value === '' ? undefined : idField(value); }
  private async reachablePr(user: User, pullRequestId: number) {
    const row = (await this.prisma.pullRequest.findFirst({ where: { id: BigInt(pullRequestId) }, select: { id: true, projectId: true, url: true, title: true, state: true }, })) as { id: bigint; projectId: number; url: string; title: string; state: PrState } | undefined;
    if (!row) throw new NotFoundException('PR bulunamadı.');
    await this.workspace.reachable(user, row.projectId);
    return row;
  }
  private async logForTasks(projectId: number, taskIds: number[], action: 'pr.link' | 'pr.unlink' | 'pr.merge', detail: string, actor: User) {
    if (!taskIds.length) return;
    const rows = (await this.prisma.task.findMany({ where: { id: { in: taskIds } }, select: { id: true, title: true }, })) as { id: number; title: string }[];
    for (const task of rows) {
      await this.workspace.log({ projectId, taskId: task.id, taskTitle: task.title, action, detail, actor });
    }
  }
  private async rows(projectIds: number[]) {
    return (await sql(this.prisma, `
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
      ORDER BY (pr.state <> 'open'), pr."createdAt", pr.id`, [projectIds])).rows;
  }
  private async feed(user: User, requested?: number) {
    const reachable = await this.workspace.projectIds(user);
    const projects = reachable.length
      ? (await this.prisma.project.findMany({ where: { id: { in: reachable } }, select: { id: true, name: true }, orderBy: [{ name: 'asc' }], }))
      : [];
    if (!projects.length) return { projects: [], projectId: null, rows: [] };
    // Erişimi olmayan bir proje istenirse süzme yok sayılır; veri sızmaz, liste tümüne düşer.
    const projectId = requested !== undefined && reachable.includes(requested) ? requested : null;
    return { projects, projectId, rows: await this.rows(projectId === null ? reachable : [projectId]) };
  }
  async index(req: AuthRequest, projectId?: string) {
    const user = allow(req, 'pr.view');
    return this.feed(user, projectId === undefined || projectId === '' ? undefined : idField(projectId));
  }
  async linkable(req: AuthRequest, projectId: string) {
    const user = allow(req, 'pr.view');
    const id = await this.workspace.reachable(user, idField(projectId));
    return (await sql(this.prisma,
      `SELECT t.id, t.title FROM tasks t JOIN columns c ON c.id=t."columnId" WHERE c."projectId"=$1 ORDER BY t.id DESC`, [id],
    )).rows;
  }
  async create(req: AuthRequest, body: CreatePullRequestDto, view?: string) {
    const user = allow(req, 'pr.create');
    // Tamamlanmış projede pano dondurulur; PR eklemek de bir pano değişikliğidir.
    const projectId = await this.workspace.writable(user, idField(body.projectId));
    const url = this.urlField(body.url), title = textField(body.title, 'PR adı', 200);
    const description = body.description === undefined || body.description === '' ? '' : textField(body.description, 'Açıklama', 5000);
    const taskIds = await this.taskIds(projectId, body.taskIds);
    const created = await this.workspace.transaction(async client => {
      const inserted = (await client.pullRequest.create({ data: { projectId, url, title, description, createdBy: user.id }, select: { id: true } })).id;
      for (const taskId of taskIds) (await client.pullRequestTask.create({ data: { pullRequestId: BigInt(inserted), taskId } }));
      return inserted;
    }).catch((error: { code?: string }) => {
      if (error.code === 'P2002') throw new BadRequestException('Bu PR bu projeye zaten eklenmiş.');
      throw error;
    });
    await this.logForTasks(projectId, taskIds, 'pr.link', `PR bağlandı: ${title}`, user);
    // Yazma sonrası liste tüm projelere düşer; ekran kendi filtresini yeniden uygular.
    return { ...await this.feed(user, this.view(view)), createdPullRequestId: created.toString() };
  }
  async update(req: AuthRequest, id: string, body: UpdatePullRequestDto, view?: string) {
    const user = allow(req, 'pr.update');
    const pullRequest = await this.reachablePr(user, idField(id));
    await this.workspace.writable(user, pullRequest.projectId);
    const data: Prisma.PullRequestUpdateInput = {};
    if (body.url !== undefined) { data.url = this.urlField(body.url); }
    if (body.title !== undefined) { data.title = textField(body.title, 'PR adı', 200); }
    if (body.description !== undefined) {
      data.description = body.description === '' ? '' : textField(body.description, 'Açıklama', 5000);
    }
    // Bağ listesi gönderilirse tamamen değiştirilir; günlüğe yalnızca fark yazılır.
    const before = (await this.prisma.pullRequestTask.findMany({ where: { pullRequestId: BigInt(pullRequest.id) }, select: { taskId: true }, })).map(row => row.taskId as number);
    const after = body.taskIds === undefined ? before : await this.taskIds(pullRequest.projectId, body.taskIds);
    if (!Object.keys(data).length && body.taskIds === undefined) throw new BadRequestException('Güncellenecek alan gönderilmedi.');
    await this.workspace.transaction(async client => {
      if (Object.keys(data).length) {
        await client.pullRequest.update({ where: { id: pullRequest.id }, data: { ...data, updatedAt: new Date() } });
      }
      if (body.taskIds !== undefined) {
        await client.pullRequestTask.deleteMany({ where: { pullRequestId: BigInt(pullRequest.id) }, });
        for (const taskId of after) (await client.pullRequestTask.create({ data: { pullRequestId: BigInt(pullRequest.id), taskId } }));
      }
    }).catch((error: { code?: string }) => {
      if (error.code === 'P2002') throw new BadRequestException('Bu PR bu projeye zaten eklenmiş.');
      throw error;
    });
    const title = body.title === undefined ? pullRequest.title : String(body.title).trim();
    await this.logForTasks(pullRequest.projectId, after.filter(taskId => !before.includes(taskId)), 'pr.link', `PR bağlandı: ${title}`, user);
    await this.logForTasks(pullRequest.projectId, before.filter(taskId => !after.includes(taskId)), 'pr.unlink', `PR bağı kaldırıldı: ${title}`, user);
    return this.feed(user, this.view(view));
  }
  async setState(req: AuthRequest, id: string, body: PullRequestStateDto, view?: string) {
    const user = allow(req, 'pr.merge');
    const pullRequest = await this.reachablePr(user, idField(id));
    await this.workspace.writable(user, pullRequest.projectId);
    const state = this.state(body.state);
    // 'merged' dışına çıkıldığında onay bilgisi temizlenir; yanlış işaretleme geri alınabilir.
    await this.prisma.pullRequest.update({
      where: { id: pullRequest.id }, data: {
        state, mergedAt: state === 'merged' ? new Date() : null, mergedBy: state === 'merged' ? user.id : null, updatedAt: new Date(),
      }
    });
    if (state === 'merged' && pullRequest.state !== 'merged') {
      const linked = (await this.prisma.pullRequestTask.findMany({ where: { pullRequestId: BigInt(pullRequest.id) }, select: { taskId: true }, })).map(row => row.taskId as number);
      await this.logForTasks(pullRequest.projectId, linked, 'pr.merge', `PR onaylandı: ${pullRequest.title}`, user);
    }
    return this.feed(user, this.view(view));
  }
  async remove(req: AuthRequest, id: string, view?: string) {
    const user = allow(req, 'pr.delete');
    const pullRequest = await this.reachablePr(user, idField(id));
    await this.workspace.writable(user, pullRequest.projectId);
    const linked = (await this.prisma.pullRequestTask.findMany({ where: { pullRequestId: BigInt(pullRequest.id) }, select: { taskId: true }, })).map(row => row.taskId as number);
    await this.prisma.pullRequest.deleteMany({ where: { id: BigInt(pullRequest.id) }, });
    await this.logForTasks(pullRequest.projectId, linked, 'pr.unlink', `PR silindi: ${pullRequest.title}`, user);
    return this.feed(user, this.view(view));
  }
}
