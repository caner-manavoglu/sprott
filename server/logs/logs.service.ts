import { Inject, Injectable } from '@nestjs/common';
import { allow } from '../common/auth.ts';
import { idField, type User } from '../common/fields.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { query } from '../prisma/sql.ts';
import { AccessService } from '../workspace/access.service.ts';

@Injectable()
export class LogsService {
  /** İstemcinin seçebileceği sayfa boyutları; ilki varsayılan. */
  static readonly pageSizes = [10, 20, 50];
  constructor(@Inject(AccessService) private access: AccessService, @Inject(PrismaService) private prisma: PrismaService) { }
  async index(user: User, rawProjectId?: string, rawTaskId?: string, rawActorId?: string, rawPage?: string, rawPageSize?: string) {
    // Tanınmayan boyut istenirse varsayılana düşülür; keyfi LIMIT kabul edilmez.
    const pageSize = LogsService.pageSizes.includes(Number(rawPageSize)) ? Number(rawPageSize) : LogsService.pageSizes[0];
    allow(user, 'log.view');
    const ids = await this.access.projectIds(user);
    const empty = { projects: [], projectId: null, tasks: [], actors: [], rows: [], total: 0, page: 1, pageSize, pageSizes: LogsService.pageSizes };
    if (!ids.length) return empty;
    const projects = (await this.prisma.project.findMany({ where: { id: { in: ids } }, select: { id: true, name: true }, orderBy: [{ name: 'asc' }], }));
    // Tanınmayan veya erişilemeyen proje istenirse ilk projeye düşülür.
    const requested = rawProjectId ? idField(rawProjectId) : null;
    const projectId = requested !== null && ids.includes(requested) ? requested : projects[0].id;
    const taskId = rawTaskId ? idField(rawTaskId) : null;
    const actorId = rawActorId ? idField(rawActorId) : null;
    const page = Math.max(1, Number(rawPage) || 1);
    const [tasks, actors] = await Promise.all([
      this.prisma.task.findMany({ where: { column: { projectId } }, select: { id: true, title: true }, orderBy: { id: 'asc' } }),
      // Personel listesi günlüğün kendisinden türetilir; kaydı olmayan kişi filtrede görünmez.
      query(this.prisma,
        `SELECT DISTINCT "actorId" AS id, "actorName" AS name FROM activity_log
         WHERE "projectId"=$1 AND "actorId" IS NOT NULL ORDER BY name`,
        [projectId],
      ),
    ]);
    const filter = `WHERE "projectId"=$1 AND ($2::int IS NULL OR "taskId"=$2) AND ($3::int IS NULL OR "actorId"=$3)`;
    const params = [projectId, taskId, actorId];
    const total = await this.prisma.activityLog.count({ where: { projectId, ...(taskId ? { taskId } : {}), ...(actorId ? { actorId } : {}) } });
    const rows = await query(this.prisma,
      `SELECT id, action, detail, "taskId", "taskTitle", "actorId", "actorName", "createdAt"
       FROM activity_log ${filter}
       ORDER BY "createdAt" DESC, id DESC LIMIT $4 OFFSET $5`,
      [...params, pageSize, (page - 1) * pageSize],
    );
    return { projects, projectId, tasks, actors, rows, total, page, pageSize, pageSizes: LogsService.pageSizes };
  }
}
