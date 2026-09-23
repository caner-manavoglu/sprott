import { Inject, Injectable } from '@nestjs/common';
import { type AuthRequest, allow } from '../common/auth.ts';
import { idField } from '../common/fields.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { sql } from '../prisma/sql.ts';
import { WorkspaceService } from '../workspace/workspace.service.ts';

@Injectable()
export class LogsService {
  /** İstemcinin seçebileceği sayfa boyutları; ilki varsayılan. */
  static readonly pageSizes = [10, 20, 50];
  constructor(@Inject(WorkspaceService) private workspace: WorkspaceService, @Inject(PrismaService) private prisma: PrismaService) { }
  async index(req: AuthRequest, rawProjectId?: string, rawTaskId?: string, rawActorId?: string, rawPage?: string, rawPageSize?: string) {
    // Tanınmayan boyut istenirse varsayılana düşülür; keyfi LIMIT kabul edilmez.
    const pageSize = LogsService.pageSizes.includes(Number(rawPageSize)) ? Number(rawPageSize) : LogsService.pageSizes[0];
    const user = allow(req, 'log.view');
    const ids = await this.workspace.projectIds(user);
    const empty = { projects: [], projectId: null, tasks: [], actors: [], rows: [], total: 0, page: 1, pageSize, pageSizes: LogsService.pageSizes };
    if (!ids.length) return empty;
    const projects = (await this.prisma.project.findMany({ where: { id: { in: ids } }, select: { id: true, name: true }, orderBy: [{ name: 'asc' }], }));
    // Tanınmayan veya erişilemeyen proje istenirse ilk projeye düşülür.
    const requested = rawProjectId ? idField(rawProjectId) : null;
    const projectId = requested !== null && ids.includes(requested) ? requested : (projects[0].id as number);
    const taskId = rawTaskId ? idField(rawTaskId) : null;
    const actorId = rawActorId ? idField(rawActorId) : null;
    const page = Math.max(1, Number(rawPage) || 1);
    const [tasks, actors] = await Promise.all([
      sql(this.prisma,
        'SELECT t.id, t.title FROM tasks t JOIN columns c ON c.id=t."columnId" WHERE c."projectId"=$1 ORDER BY t.id',
        [projectId],
      ),
      // Personel listesi günlüğün kendisinden türetilir; kaydı olmayan kişi filtrede görünmez.
      sql(this.prisma,
        `SELECT DISTINCT "actorId" AS id, "actorName" AS name FROM activity_log
         WHERE "projectId"=$1 AND "actorId" IS NOT NULL ORDER BY name`,
        [projectId],
      ),
    ]);
    const filter = `WHERE "projectId"=$1 AND ($2::int IS NULL OR "taskId"=$2) AND ($3::int IS NULL OR "actorId"=$3)`;
    const params = [projectId, taskId, actorId];
    const total = Number((await sql(this.prisma, `SELECT COUNT(*)::int AS total FROM activity_log ${filter}`, params)).rows[0].total);
    const rows = (await sql(this.prisma,
      `SELECT id, action, detail, "taskId", "taskTitle", "actorId", "actorName", "createdAt"
       FROM activity_log ${filter}
       ORDER BY "createdAt" DESC, id DESC LIMIT $4 OFFSET $5`,
      [...params, pageSize, (page - 1) * pageSize],
    )).rows;
    return { projects, projectId, tasks: tasks.rows, actors: actors.rows, rows, total, page, pageSize, pageSizes: LogsService.pageSizes };
  }
}
