import { Inject, Injectable, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { hash, MANAGED_GROUPS, TODAY, type User } from '../common/fields.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { execute, query } from '../prisma/sql.ts';

/** Oturum, başlangıç verisi ve pano gibi birden çok modülün okuduğu çekirdek sorgular. */
@Injectable()
export class WorkspaceService implements OnModuleInit {
  constructor(@Inject(PrismaService) readonly prisma: PrismaService) { }
  async initialize(seed = true) {
    if (!seed) return;
    await this.prisma.$transaction(async client => {
      await client.$executeRaw`SELECT pg_advisory_xact_lock(784210)`;
      if (await client.user.count()) return;
      const adminPassword = process.env.ADMIN_PASSWORD, userPassword = process.env.USER_PASSWORD;
      if (!adminPassword || adminPassword.length < 12 || !userPassword || userPassword.length < 12) throw new Error('İlk kurulum için .env içinde en az 12 karakterlik ADMIN_PASSWORD ve USER_PASSWORD gerekli.');
      const admin = await client.user.create({ data: { name: 'Yönetici', surname: 'Hesabı', title: 'Sistem yöneticisi', email: (process.env.ADMIN_EMAIL || 'admin@sprott.local').toLowerCase(), password: hash(adminPassword), role: 'admin', permissions: {} } });
      const user = await client.user.create({ data: { name: 'Personel', surname: 'Hesabı', title: 'Ekip üyesi', email: (process.env.USER_EMAIL || 'personel@sprott.local').toLowerCase(), password: hash(userPassword), role: 'user', permissions: { 'task.view': true, 'project.view': true } } });
      await client.project.create({
        data: {
          name: 'İlk proje', description: 'Örnek pano ve sütunlar.', createdBy: admin.id,
          members: { create: [{ userId: admin.id }, { userId: user.id }] },
          columns: { create: ['Yapılacak', 'Devam ediyor', 'Tamamlandı'].map((name, i) => ({ name, position: i + 1 })) }
        }
      });
    });
  }
  onModuleInit() { return this.initialize(); }
  // `managedGroups` her istekte tazelenir; duyuru ve grup raporu yetkileri buna bağlı olduğu için oturumda taşınır.
  async user(token: string): Promise<User | undefined> {
    if (!token) return undefined;
    return (await query<User>(this.prisma, `SELECT u.id,u.name,u.surname,u.title,u.email,u.role,u.permissions,(u."avatarContent" IS NOT NULL) AS "hasAvatar", ${MANAGED_GROUPS} AS "managedGroups" FROM users u JOIN sessions s ON u.id=s."userId" WHERE s.token=$1 AND s.expires>$2`, [token, Date.now()]))[0];
  }
  async board(projectId: number) {
    return this.prisma.$transaction(async client => {
      await execute(client, 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      const project = (await query(client,
        `SELECT id, name, description, to_char("completedAt", 'YYYY-MM-DD') AS "completedAt" FROM projects WHERE id=$1`,
        [projectId],
      ))[0];
      if (!project) throw new NotFoundException('Proje bulunamadı.');
      return {
        project,
        columns: (await client.column.findMany({ where: { projectId }, select: { id: true, name: true }, orderBy: [{ position: 'asc' }, { id: 'asc' }], })),
        // Akış kuralları: boş dizi "kural yok", yani her sütundan her sütuna geçilebilir.
        transitions: (await client.workflowTransition.findMany({ where: { projectId }, select: { fromColumnId: true, toColumnId: true }, })),
        // Yorumlar panoda taşınmaz; task açıldığında GET /tasks/:id/comments ile gelir.
        tasks: await query(client, `
          SELECT t.id, t.type, t.priority, t.title, t.description, t."columnId", t."createdBy", t."assigneeId", t."parentTaskId",
            parent.title AS "parentTitle",
            NULLIF(TRIM(CONCAT_WS(' ', reporter.name, reporter.surname)), '') AS "createdByName",
            to_char(t."startDate", 'YYYY-MM-DD') AS "startDate", to_char(t."dueDate", 'YYYY-MM-DD') AS "dueDate",
            COALESCE((SELECT json_agg(json_build_object(
              'id', a.id, 'name', a.name, 'mimeType', a."mimeType", 'size', a.size
            ) ORDER BY a.id) FROM task_attachments a WHERE a."taskId"=t.id), '[]') AS attachments,
            -- Karttaki "açık PR" rozeti ve task detayındaki liste aynı veriden beslenir.
            COALESCE((SELECT json_agg(json_build_object(
              'id', pr.id, 'url', pr.url, 'title', pr.title, 'state', pr.state
            ) ORDER BY pr.state, pr.id) FROM pull_requests pr
              JOIN pull_request_tasks prt ON prt."pullRequestId"=pr.id
              WHERE prt."taskId"=t.id), '[]') AS "pullRequests"
          FROM tasks t JOIN columns c ON c.id=t."columnId" LEFT JOIN tasks parent ON parent.id=t."parentTaskId"
            LEFT JOIN users reporter ON reporter.id=t."createdBy"
          WHERE c."projectId"=$1 ORDER BY t.id DESC`, [projectId]),
      };
    });
  }
  /**
   * Süresi geçen task'lar: bitiş tarihi bugünden önce ve projesinin son
   * (tamamlandı) sütununda olmayanlar. `userIds` null ise atama sınırı yoktur.
   * Özet ekranı ve personel raporu aynı tanımı paylaşır.
   */
  async overdueTasks(projectIds: number[], userIds: number[] | null) {
    if (!projectIds.length) return [];
    return query(this.prisma, `
      WITH final AS (
        SELECT DISTINCT ON ("projectId") id, "projectId" FROM columns WHERE "projectId" = ANY($1)
        ORDER BY "projectId", position DESC NULLS LAST, id DESC
      )
      SELECT t.id, t.title, to_char(t."dueDate", 'YYYY-MM-DD') AS "dueDate",
        (${TODAY} - t."dueDate")::int AS "daysLate",
        p.id AS "projectId", p.name AS "projectName", c.name AS "columnName",
        t."assigneeId", NULLIF(TRIM(CONCAT_WS(' ', u.name, u.surname)), '') AS "assigneeName"
      FROM tasks t
      JOIN columns c ON c.id = t."columnId"
      JOIN projects p ON p.id = c."projectId"
      LEFT JOIN final f ON f."projectId" = p.id
      LEFT JOIN users u ON u.id = t."assigneeId"
      WHERE p.id = ANY($1) AND t."dueDate" < ${TODAY}
        AND (f.id IS NULL OR t."columnId" <> f.id)
        AND ($2::int[] IS NULL OR t."assigneeId" = ANY($2))
      ORDER BY t."dueDate", p.name, t.id`, [projectIds, userIds]);
  }
  /**
   * Geçiş izni: proje için hiç kural tanımlı değilse her geçiş serbesttir.
   * Kural varsa yalnızca tanımlı (from → to) çiftleri geçerlidir. Yöneticiler bu kontrole girmez.
   */
  async transitionAllowed(projectId: number, fromColumnId: number, toColumnId: number) {
    if (fromColumnId === toColumnId) return true;
    const defined = (await this.prisma.workflowTransition.count({ where: { projectId }, }));
    if (!defined) return true;
    return !!(await this.prisma.workflowTransition.count({ where: { projectId, fromColumnId, toColumnId }, }));
  }
  /** Projenin son sütunu "tamamlandı" sayılır; rapor ve gecikme tanımıyla aynı kural. */
  async isFinalColumn(projectId: number, columnId: number) {
    const row = await this.prisma.column.findFirst({ where: { projectId }, select: { id: true }, orderBy: [{ position: 'desc' }, { id: 'desc' }] });
    return !!row && row.id === columnId;
  }
}
