import { Inject, Injectable } from '@nestjs/common';
import type { User } from '../common/fields.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { query } from '../prisma/sql.ts';
import { AccessService } from '../workspace/access.service.ts';
import { WorkspaceService } from '../workspace/workspace.service.ts';

type Row = { projectId: number; projectName: string; columnId: number; columnName: string; taskCount: number };

@Injectable()
export class DashboardService {
  constructor(
    @Inject(WorkspaceService) private workspace: WorkspaceService,
    @Inject(AccessService) private access: AccessService,
    @Inject(PrismaService) private prisma: PrismaService,
  ) { }
  async summary(user: User) {
    const ids = await this.access.projectIds(user);
    if (!ids.length) return [];
    // Yönetici tüm task’ları sayar; personel yalnızca kendine atanmış olanları.
    const assignee = user.role === 'admin' ? null : user.id;
    const rows = await query<Row>(this.prisma, `
      SELECT p.id AS "projectId", p.name AS "projectName", c.id AS "columnId", c.name AS "columnName",
        COUNT(t.id)::int AS "taskCount"
      FROM projects p
      JOIN columns c ON c."projectId"=p.id
      LEFT JOIN tasks t ON t."columnId"=c.id AND ($2::int IS NULL OR t."assigneeId"=$2)
      WHERE p.id = ANY($1)
      GROUP BY p.id, p.name, c.id, c.name, c.position
      ORDER BY p.id, c.position NULLS LAST, c.id`, [ids, assignee]);
    // Personel için sütun başına görev listesi; yöneticiye yalnızca sayım yeter.
    const tasks = assignee === null ? [] : await this.prisma.task.findMany({
      where: { column: { projectId: { in: ids } }, assigneeId: assignee }, select: { id: true, title: true, columnId: true }, orderBy: { id: 'desc' },
    });
    const projects = new Map<number, { id: number; name: string; columns: { id: number; name: string; taskCount: number; tasks: { id: number; title: string }[] }[] }>();
    for (const row of rows) {
      const project = projects.get(row.projectId) ?? { id: row.projectId, name: row.projectName, columns: [] };
      project.columns.push({
        id: row.columnId, name: row.columnName, taskCount: row.taskCount,
        tasks: tasks.filter(task => task.columnId === row.columnId).map(({ id, title }) => ({ id, title })),
      });
      projects.set(row.projectId, project);
    }
    return [...projects.values()];
  }
  async overdue(user: User) {
    const [ids, { userIds }] = await Promise.all([this.access.projectIds(user), this.access.visibleUsers(user)]);
    return this.workspace.overdueTasks(ids, userIds);
  }
}
