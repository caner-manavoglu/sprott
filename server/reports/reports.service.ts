import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TODAY, type User } from '../common/fields.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { query } from '../prisma/sql.ts';
import { AccessService } from '../workspace/access.service.ts';
import { WorkspaceService } from '../workspace/workspace.service.ts';

@Injectable()
export class ReportsService {
  constructor(
    @Inject(WorkspaceService) private workspace: WorkspaceService,
    @Inject(AccessService) private access: AccessService,
    @Inject(PrismaService) private prisma: PrismaService,
  ) { }
  async index(user: User) {
    const [projectIds, { scope, groups, userIds }] = await Promise.all([this.access.projectIds(user), this.access.visibleUsers(user)]);
    if (!projectIds.length) return { scope, groups, total: 0, rows: [] };
    // Tamamlanan task: projesinin son sırasındaki sütunda duran task. Rapor yalnızca personeli listeler.
    const rows = await query<{ completed: number }>(this.prisma, `
      WITH final AS (
        SELECT DISTINCT ON ("projectId") id FROM columns WHERE "projectId" = ANY($1)
        ORDER BY "projectId", position DESC NULLS LAST, id DESC
      )
      SELECT u.id, u.name, u.surname, u.title, (u."avatarContent" IS NOT NULL) AS "hasAvatar",
        COUNT(t.id)::int AS assigned,
        COUNT(t.id) FILTER (WHERE t."columnId" IN (SELECT id FROM final))::int AS completed,
        COUNT(t.id) FILTER (WHERE t.type='bug')::int AS bugs,
        COUNT(t.id) FILTER (WHERE t."dueDate" < ${TODAY} AND t."columnId" NOT IN (SELECT id FROM final))::int AS overdue
      FROM users u
      LEFT JOIN tasks t ON t."assigneeId"=u.id AND t."columnId" IN (SELECT id FROM columns WHERE "projectId" = ANY($1))
      WHERE u.role='user' AND ($2::int[] IS NULL OR u.id = ANY($2))
      GROUP BY u.id, u.name, u.surname, u.title, u."avatarContent"
      ORDER BY completed DESC, u.name, u.surname`, [projectIds, userIds]);
    return { scope, groups, total: rows.reduce((sum, row) => sum + row.completed, 0), rows };
  }
  async detail(viewer: User, id: number) {
    const { userIds } = await this.access.visibleUsers(viewer);
    if (userIds && !userIds.includes(id)) throw new ForbiddenException('Bu personelin raporunu görme yetkiniz yok.');
    const person = (await query(this.prisma, `SELECT id,name,surname,title,("avatarContent" IS NOT NULL) AS "hasAvatar" FROM users WHERE id=$1 AND role='user'`, [id]))[0];
    if (!person) throw new NotFoundException('Personel bulunamadı.');
    // Personelin üyesi olduğu projeler; rapora bakan kişi yalnızca eriştiği projeleri görür.
    const projectIds = await this.access.projectIds(viewer);
    const rows = projectIds.length ? await query<{ completed: number }>(this.prisma, `
      WITH final AS (
        SELECT DISTINCT ON ("projectId") id, "projectId" FROM columns WHERE "projectId" = ANY($1)
        ORDER BY "projectId", position DESC NULLS LAST, id DESC
      )
      SELECT p.id AS "projectId", p.name AS "projectName",
        COUNT(t.id)::int AS assigned,
        COUNT(t.id) FILTER (WHERE t."columnId"=f.id)::int AS completed,
        COUNT(t.id) FILTER (WHERE t.type='bug')::int AS bugs,
        COUNT(t.id) FILTER (WHERE t."dueDate" < ${TODAY} AND t."columnId" <> f.id)::int AS overdue
      FROM projects p
      JOIN project_members m ON m."projectId"=p.id AND m."userId"=$2
      LEFT JOIN final f ON f."projectId"=p.id
      LEFT JOIN columns c ON c."projectId"=p.id
      LEFT JOIN tasks t ON t."columnId"=c.id AND t."assigneeId"=$2
      WHERE p.id = ANY($1)
      GROUP BY p.id, p.name
      ORDER BY completed DESC, p.name`, [projectIds, id]) : [];
    // Hangi task'ların süresi geçmiş: sayının yanında listenin kendisi de döner.
    const overdue = await this.workspace.overdueTasks(projectIds, [id]);
    return { person, total: rows.reduce((sum, row) => sum + row.completed, 0), rows, overdue };
  }
}
