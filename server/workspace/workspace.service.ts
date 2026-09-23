import { ForbiddenException, Inject, Injectable, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { can, hash, MANAGED_GROUPS, TODAY, type User } from '../common/fields.ts';
import { type Prisma } from '../generated/prisma/client.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { sql } from '../prisma/sql.ts';

@Injectable()
export class WorkspaceService implements OnModuleInit {
  constructor(@Inject(PrismaService) readonly prisma: PrismaService) { }
  transaction<T>(action: (client: Prisma.TransactionClient) => Promise<T>) { return this.prisma.$transaction(action); }
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
  async user(token: string): Promise<User | undefined> { return (await sql(this.prisma, `SELECT u.id,u.name,u.surname,u.title,u.email,u.role,u.permissions,(u."avatarContent" IS NOT NULL) AS "hasAvatar", ${MANAGED_GROUPS} AS "managedGroups" FROM users u JOIN sessions s ON u.id=s."userId" WHERE s.token=$1 AND s.expires>$2`, [token, Date.now()])).rows[0]; }
  async board(projectId: number) {
    return this.transaction(async client => {
      await sql(client, 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      const project = (await sql(client,
        `SELECT id, name, description, to_char("completedAt", 'YYYY-MM-DD') AS "completedAt" FROM projects WHERE id=$1`,
        [projectId],
      )).rows[0];
      if (!project) throw new NotFoundException('Proje bulunamadı.');
      return {
        project,
        columns: (await client.column.findMany({ where: { projectId }, select: { id: true, name: true }, orderBy: [{ position: 'asc' }, { id: 'asc' }], })),
        // Akış kuralları: boş dizi "kural yok", yani her sütundan her sütuna geçilebilir.
        transitions: (await client.workflowTransition.findMany({ where: { projectId }, select: { fromColumnId: true, toColumnId: true }, })),
        tasks: (await sql(client, `
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
              WHERE prt."taskId"=t.id), '[]') AS "pullRequests",
            COALESCE((SELECT json_agg(json_build_object(
              'id', cm.id, 'body', cm.body, 'authorId', cm."authorId",
              'authorName', NULLIF(TRIM(CONCAT_WS(' ', author.name, author.surname)), ''),
              'authorHasAvatar', (author."avatarContent" IS NOT NULL),
              'createdAt', cm."createdAt", 'updatedAt', cm."updatedAt",
              'mentions', COALESCE((SELECT json_agg(json_build_object(
                'id', mentioned.id, 'name', NULLIF(TRIM(CONCAT_WS(' ', mentioned.name, mentioned.surname)), '')
              ) ORDER BY mentioned.name, mentioned.surname, mentioned.id)
                FROM task_comment_mentions mention JOIN users mentioned ON mentioned.id=mention."userId"
                WHERE mention."commentId"=cm.id), '[]'),
              'attachments', COALESCE((SELECT json_agg(json_build_object(
                'id', ca.id, 'name', ca.name, 'mimeType', ca."mimeType", 'size', ca.size
              ) ORDER BY ca.id) FROM task_comment_attachments ca WHERE ca."commentId"=cm.id), '[]')
            ) ORDER BY cm."createdAt", cm.id) FROM task_comments cm JOIN users author ON author.id=cm."authorId"
              WHERE cm."taskId"=t.id), '[]') AS comments
          FROM tasks t JOIN columns c ON c.id=t."columnId" LEFT JOIN tasks parent ON parent.id=t."parentTaskId"
            LEFT JOIN users reporter ON reporter.id=t."createdBy"
          WHERE c."projectId"=$1 ORDER BY t.id DESC`, [projectId])).rows,
      };
    });
  }
  /** Yöneticiler her projeye erişir; personel yalnızca üyesi olduğu projelere. */
  async reachable(user: User, projectId: number) {
    if (!(await this.prisma.project.findFirst({ where: { id: projectId }, select: { id: true }, }))) throw new NotFoundException('Proje bulunamadı.');
    if (user.role !== 'admin' && !(await this.prisma.projectMember.count({ where: { projectId, userId: user.id }, }))) {
      throw new ForbiddenException('Bu projenin üyesi değilsiniz.');
    }
    return projectId;
  }
  /**
   * Panoya yazma izni: projeye erişim + projenin tamamlanmamış olması.
   * Tamamlanan projede sütunlar ve task'lar dondurulur; kayıtlar olduğu gibi kalır.
   * Projenin kendisi (ad, açıklama, tarihler, üyeler) düzenlenebilir ve yeniden açılabilir.
   */
  async writable(user: User, projectId: number) {
    await this.reachable(user, projectId);
    if ((await this.prisma.project.count({ where: { id: projectId, completedAt: { not: null } }, }))) {
      throw new ForbiddenException('Proje tamamlandı. Değişiklik için projeyi yeniden açın.');
    }
    return projectId;
  }
  async projectIds(user: User): Promise<number[]> {
    const rows = user.role === 'admin'
      ? (await this.prisma.project.findMany({ select: { id: true }, orderBy: [{ id: 'asc' }], }))
      : (await sql(this.prisma, 'SELECT p.id FROM projects p JOIN project_members m ON m."projectId"=p.id WHERE m."userId"=$1 ORDER BY p.id', [user.id])).rows;
    return rows.map(row => row.id);
  }
  /**
   * Kimlerin kaydını görebilir: tüm personel > yönettiği grupların üyeleri > yalnızca kendisi.
   * `userIds` null ise sınır yoktur. Raporlar ve süresi geçen task listesi aynı kapsamı kullanır.
   */
  async visibleUsers(user: User) {
    const managed: { id: number; name: string }[] = can(user, 'report.view.group')
      ? (await sql(this.prisma, 'SELECT g.id, g.name FROM groups g JOIN group_managers m ON m."groupId"=g.id WHERE m."userId"=$1 ORDER BY g.name', [user.id])).rows
      : [];
    const scope = can(user, 'report.view.all') ? 'all' : managed.length ? 'group' : 'self';
    const userIds = scope === 'all' ? null
      : scope === 'self' ? [user.id]
        : [...new Set([user.id, ...(await this.prisma.groupMember.findMany({ where: { groupId: { in: managed.map(group => group.id) } }, select: { userId: true }, })).map(row => row.userId as number)])];
    return { scope, groups: managed.map(group => group.name), userIds };
  }
  /**
   * Süresi geçen task'lar: bitiş tarihi bugünden önce ve projesinin son
   * (tamamlandı) sütununda olmayanlar. `userIds` null ise atama sınırı yoktur.
   * Özet ekranı ve personel raporu aynı tanımı paylaşır.
   */
  async overdueTasks(projectIds: number[], userIds: number[] | null) {
    if (!projectIds.length) return [];
    return (await sql(this.prisma, `
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
      ORDER BY t."dueDate", p.name, t.id`, [projectIds, userIds])).rows;
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
  /** Kişinin yöneticisi olduğu grupların kimlikleri; duyuru hedefi ve yetki kontrolü buradan çıkar. */
  async managedGroupIds(userId: number): Promise<number[]> {
    return (await this.prisma.groupManager.findMany({ where: { userId }, select: { groupId: true }, orderBy: [{ groupId: 'asc' }], })).map(row => row.groupId as number);
  }
  /**
   * Duyuru oluşturabilir mi: yöneticiler her zaman, personel ise hem `announcement.create`
   * yetkisine hem de en az bir grubun yöneticiliğine sahipse. Yetki grup yöneticiliğinden
   * türediği için gruptan çıkarılan kişi duyuru oluşturamaz hale gelir.
   */
  async canAnnounce(user: User) {
    if (user.role === 'admin') return true;
    if (!can(user, 'announcement.create')) return false;
    return (await this.managedGroupIds(user.id)).length > 0;
  }
  /**
   * Duyuruyu görecek kişiler: hedef grubu yoksa tüm kullanıcılar, varsa o grupların üyeleri.
   * Duyuruyu yazan kişi de listeye girer, böylece kendi duyurusunu listesinde görür.
   */
  async announcementAudience(announcementId: number): Promise<number[]> {
    return (await sql(this.prisma, `
      SELECT u.id FROM users u
      WHERE NOT EXISTS (SELECT 1 FROM announcement_groups WHERE "announcementId"=$1)
         OR u.id IN (SELECT m."userId" FROM group_members m JOIN announcement_groups ag ON ag."groupId"=m."groupId" WHERE ag."announcementId"=$1)
         OR u.id = (SELECT "createdBy" FROM announcements WHERE id=$1)
      ORDER BY u.id`, [announcementId])).rows.map(row => row.id as number);
  }
  /**
   * Duyuruyu okundu işaretler. Duyuru okundu kaydı ile bildirimin okundu durumu
   * tek adımda ilerler; kullanıcının aynı duyuruyu bir de bildirimlerden
   * okundu işaretlemesi gerekmez.
   *
   * Okuma kaydı yalnızca zorunlu duyurular için tutulur: okundu raporu zorunlu
   * duyurunun onay kaydıdır, zorunlu olmayan duyuruda takip edilmez. Bildirimin
   * kendi okundu durumu her iki türde de ilerler.
   */
  async readAnnouncement(userId: number, announcementId: number) {
    await sql(this.prisma, `
      INSERT INTO announcement_reads("announcementId","userId")
      SELECT a.id, $2 FROM announcements a WHERE a.id=$1 AND a.mandatory
      ON CONFLICT DO NOTHING`,
      [announcementId, userId],
    );
    await this.prisma.notification.updateMany({ where: { userId, announcementId, readAt: null }, data: { readAt: new Date() } });
  }
  /**
   * Duyuru bildirimi; task bildirimlerinden ayrı çünkü kaydın `taskId` alanı boştur.
   * Aynı kişiye aynı duyuru için ikinci bildirim yazılmaz, böylece duyuru düzenlenip
   * hedef kitlesi genişlediğinde yalnızca yeni kişiler haberdar edilir.
   */
  async notifyAnnouncement(userIds: number[], announcementId: number, actorId: number) {
    const ids = [...new Set(userIds)].filter(id => id !== actorId);
    if (!ids.length) return;
    await sql(this.prisma, `
      INSERT INTO notifications("userId",type,"announcementId","actorId")
      SELECT candidate.id, 'announcement', $2, $3 FROM UNNEST($1::int[]) AS candidate(id)
      WHERE NOT EXISTS (SELECT 1 FROM notifications n WHERE n."userId"=candidate.id AND n."announcementId"=$2)`,
      [ids, announcementId, actorId],
    );
  }
  /** Bildirim yazar. Kendi eylemi kimseye bildirilmez, bu yüzden `actorId` listeden çıkarılır. */
  async notify(userIds: (number | null)[], type: 'assigned' | 'completed' | 'mention' | 'comment', taskId: number, actorId: number) {
    const ids = [...new Set(userIds)].filter((id): id is number => typeof id === 'number' && id !== actorId);
    if (!ids.length) return;
    await this.prisma.notification.createMany({ data: ids.map(userId => ({ userId, type, taskId, actorId })) });
  }
  /** Projenin son sütunu "tamamlandı" sayılır; rapor ve gecikme tanımıyla aynı kural. */
  async isFinalColumn(projectId: number, columnId: number) {
    const row = (await this.prisma.column.findFirst({ where: { projectId }, select: { id: true }, orderBy: [{ position: 'desc' }, { id: 'desc' }], })) as { id: number } | undefined;
    return !!row && row.id === columnId;
  }
  /** Task tamamlandığında haberdar edilecekler: yöneticiler ve atanan kişinin grup yöneticileri. */
  async managerIds(assigneeId: number | null): Promise<number[]> {
    return (await sql(this.prisma, `
      SELECT id FROM users WHERE role='admin'
      UNION
      SELECT gm."userId" FROM group_managers gm JOIN group_members m ON m."groupId"=gm."groupId"
      WHERE $1::int IS NOT NULL AND m."userId"=$1`, [assigneeId])).rows.map(row => row.id as number);
  }
  /**
   * Etkinlik günlüğüne kayıt ekler. Günlük yalnızca büyür: hiçbir yerde
   * güncellenmez veya silinmez, API'de yalnızca GET ucu vardır.
   * Task adı ve kişi adı anlık kopyalanır, böylece kayıt silinse de geçmiş okunur kalır.
   */
  async log(entry: {
    projectId: number; taskId: number | null; taskTitle: string;
    action: 'task.create' | 'task.move' | 'task.assign' | 'task.delete' | 'comment.create'
    | 'pr.link' | 'pr.unlink' | 'pr.merge';
    detail?: string | null; actor: User;
  }) {
    await this.prisma.activityLog.create({ data: { projectId: entry.projectId, taskId: entry.taskId, taskTitle: entry.taskTitle, action: entry.action, detail: entry.detail ?? null, actorId: entry.actor.id, actorName: `${entry.actor.name} ${entry.actor.surname}`.trim() } });
  }
  /** Sütunun bağlı olduğu proje; sütun yoksa 404. */
  async columnProject(columnId: number): Promise<number> {
    const row = (await this.prisma.column.findFirst({ where: { id: columnId }, select: { projectId: true }, }));
    if (!row) throw new NotFoundException('Sütun bulunamadı.');
    return row.projectId;
  }
}
