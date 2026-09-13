import 'dotenv/config';
import { readFileSync, readdirSync } from 'node:fs';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import { APP_TIMEZONE, monthAgo } from '../shared/timezone.ts';

// Yetkiler JSONB olarak tutulur; yeni modül yetkisi eklemek için buraya bir anahtar eklemek yeterlidir.
export const PERMISSIONS = [
  'task.view', 'task.create', 'task.update', 'task.delete',
  'user.view', 'user.create', 'user.update', 'user.delete',
  'group.view', 'group.create', 'group.update', 'group.delete',
  'project.view', 'project.create', 'project.update', 'project.delete',
  'report.view.all', 'report.view.group',
  'workflow.view', 'workflow.create', 'workflow.update', 'workflow.delete',
  'pr.view', 'pr.create', 'pr.update', 'pr.delete', 'pr.merge',
  'log.view',
  'announcement.create',
] as const;
export type Permission = typeof PERMISSIONS[number];
export type User = { id: number; name: string; surname: string; title: string; email: string; role: 'admin' | 'user'; permissions: Partial<Record<Permission, boolean>>; managedGroups?: string[] };
// Yöneticiler her yetkiye sahiptir; personelin yetkisi kaydedilmiş olmalıdır.
export const can = (user: User, permission: Permission) => user.role === 'admin' || user.permissions?.[permission] === true;
export function hash(password: string) { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`; }
export function matches(password: string, saved: string) { const [salt, key] = saved.split(':'); return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(key, 'hex')); }
export function textField(value: unknown, label: string, max: number) { if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new BadRequestException(`${label} 1–${max} karakter olmalı.`); return value.trim(); }
export function emailField(value: unknown) {
  const email = textField(value, 'E-posta', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Geçerli bir e-posta adresi girin.');
  return email;
}
export function passwordField(value: unknown) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 256) throw new BadRequestException('Şifre 8–256 karakter olmalı.');
  return value;
}
/**
 * Uygulama saat dilimindeki bugünün tarihi. SQL tarafında `TODAY` ile aynı günü verir;
 * ikisi de `CURRENT_DATE`/sunucu yereli yerine `APP_TIMEZONE` üzerinden hesaplanır.
 */
export { isoDate, monthAgo } from '../shared/timezone.ts';
/** Tarih karşılaştırmalarının SQL karşılığı; `CURRENT_DATE` sunucunun saat dilimine bağlıdır. */
export const TODAY = `(now() AT TIME ZONE '${APP_TIMEZONE}')::date`;
/** 'YYYY-MM-DD' bekler; boş değer tarihin kaldırılması anlamına gelir. */
export function dateField(value: unknown, label: string) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException(`${label} YYYY-AA-GG biçiminde olmalı.`);
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) throw new BadRequestException(`${label} geçerli bir tarih olmalı.`);
  return value;
}
/**
 * Task tarihleri: başlangıç bugünden en fazla bir ay geriye alınabilir, bitişte üst sınır yoktur.
 * `enforceStartLimit` yalnızca başlangıç bu istekte gönderildiğinde geçerlidir; eski task'ların
 * bitişi güncellenirken geçmiş başlangıç tarihi hata vermez.
 */
export function taskDates(startValue: unknown, dueValue: unknown, enforceStartLimit = true) {
  const startDate = dateField(startValue, 'Başlangıç tarihi'), dueDate = dateField(dueValue, 'Bitiş tarihi');
  if (startDate && enforceStartLimit && startDate < monthAgo()) throw new BadRequestException('Başlangıç tarihi bugünden en fazla bir ay öncesi olabilir.');
  if (startDate && dueDate && dueDate < startDate) throw new BadRequestException('Bitiş tarihi başlangıç tarihinden önce olamaz.');
  return {startDate, dueDate};
}
/**
 * Kişinin yönettiği grupların adları. Kaynak `group_managers` tablosudur;
 * gruptan yönetici eklenip çıkarıldıkça listeler kendiliğinden güncellenir.
 */
export const MANAGED_GROUPS = `COALESCE((SELECT json_agg(g.name ORDER BY g.name) FROM group_managers m JOIN groups g ON g.id=m."groupId" WHERE m."userId"=u.id), '[]')`;
export function idField(value: unknown) { const id = Number(value); if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647) throw new BadRequestException('Geçersiz kayıt.'); return id; }
@Injectable()
export class Store implements OnModuleInit, OnModuleDestroy {
  db: Pool;
  constructor() {
    if (!process.env.DATABASE_URL) throw new Error('.env içinde DATABASE_URL gerekli.');
    this.db = new Pool({connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000});
    this.db.on('error', error => console.error('PostgreSQL bağlantı hatası:', error.message));
  }
  async transaction<T>(action: (client: PoolClient) => Promise<T>) {
    const client = await this.db.connect();
    try { await client.query('BEGIN'); const result = await action(client); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async initialize(seed = true) {
    await this.transaction(async client => {
      // Serialize first-start schema creation and seeding across app instances.
      await client.query('SELECT pg_advisory_xact_lock(784210)');
      const directory = new URL('./migrations/', import.meta.url);
      for (const file of readdirSync(directory).sort()) await client.query(readFileSync(new URL(file, directory), 'utf8'));
      if (seed && !(await client.query('SELECT id FROM users LIMIT 1')).rowCount) {
        const adminPassword = process.env.ADMIN_PASSWORD, userPassword = process.env.USER_PASSWORD;
        if (!adminPassword || adminPassword.length < 12 || !userPassword || userPassword.length < 12) throw new Error('İlk kurulum için .env içinde en az 12 karakterlik ADMIN_PASSWORD ve USER_PASSWORD gerekli.');
        const insert = 'INSERT INTO users(name,surname,title,email,password,role,permissions) VALUES($1,$2,$3,$4,$5,$6,$7)';
        await client.query(insert, ['Yönetici', 'Hesabı', 'Sistem yöneticisi', (process.env.ADMIN_EMAIL || 'admin@sprott.local').toLowerCase(), hash(adminPassword), 'admin', {}]);
        await client.query(insert, ['Personel', 'Hesabı', 'Ekip üyesi', (process.env.USER_EMAIL || 'personel@sprott.local').toLowerCase(), hash(userPassword), 'user', {'task.view': true, 'project.view': true}]);
        const project = (await client.query('INSERT INTO projects(name,description,"createdBy") VALUES($1,$2,(SELECT id FROM users WHERE role=$3 ORDER BY id LIMIT 1)) RETURNING id', ['İlk proje', 'Örnek pano ve sütunlar.', 'admin'])).rows[0].id;
        await client.query('INSERT INTO project_members("projectId","userId") SELECT $1, id FROM users', [project]);
        for (const name of ['Yapılacak', 'Devam ediyor', 'Tamamlandı']) await client.query('INSERT INTO columns(name,position,"projectId") SELECT $1, COALESCE(MAX(position),0)+1, $2 FROM columns WHERE "projectId"=$2', [name, project]);
      }
    });
  }
  onModuleInit() { return this.initialize(); }
  onModuleDestroy() { return this.db.end(); }
  // `managedGroups` her istekte tazelenir; duyuru ve grup raporu yetkileri buna bağlı olduğu için oturumda taşınır.
  async user(token: string): Promise<User | undefined> { return (await this.db.query(`SELECT u.id,u.name,u.surname,u.title,u.email,u.role,u.permissions, ${MANAGED_GROUPS} AS "managedGroups" FROM users u JOIN sessions s ON u.id=s."userId" WHERE s.token=$1 AND s.expires>$2`, [token, Date.now()])).rows[0]; }
  async board(projectId: number) {
    return this.transaction(async client => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      const project = (await client.query(
        `SELECT id, name, description, to_char("completedAt", 'YYYY-MM-DD') AS "completedAt" FROM projects WHERE id=$1`,
        [projectId],
      )).rows[0];
      if (!project) throw new NotFoundException('Proje bulunamadı.');
      return {
        project,
        columns: (await client.query('SELECT id,name FROM columns WHERE "projectId"=$1 ORDER BY position NULLS LAST,id', [projectId])).rows,
        // Akış kuralları: boş dizi "kural yok", yani her sütundan her sütuna geçilebilir.
        transitions: (await client.query('SELECT "fromColumnId","toColumnId" FROM workflow_transitions WHERE "projectId"=$1', [projectId])).rows,
        tasks: (await client.query(`
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
    if (!(await this.db.query('SELECT id FROM projects WHERE id=$1', [projectId])).rows[0]) throw new NotFoundException('Proje bulunamadı.');
    if (user.role !== 'admin' && !(await this.db.query('SELECT 1 FROM project_members WHERE "projectId"=$1 AND "userId"=$2', [projectId, user.id])).rowCount) {
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
    if ((await this.db.query('SELECT id FROM projects WHERE id=$1 AND "completedAt" IS NOT NULL', [projectId])).rowCount) {
      throw new ForbiddenException('Proje tamamlandı. Değişiklik için projeyi yeniden açın.');
    }
    return projectId;
  }
  async projectIds(user: User): Promise<number[]> {
    const rows = user.role === 'admin'
      ? (await this.db.query('SELECT id FROM projects ORDER BY id')).rows
      : (await this.db.query('SELECT p.id FROM projects p JOIN project_members m ON m."projectId"=p.id WHERE m."userId"=$1 ORDER BY p.id', [user.id])).rows;
    return rows.map(row => row.id);
  }
  /**
   * Kimlerin kaydını görebilir: tüm personel > yönettiği grupların üyeleri > yalnızca kendisi.
   * `userIds` null ise sınır yoktur. Raporlar ve süresi geçen task listesi aynı kapsamı kullanır.
   */
  async visibleUsers(user: User) {
    const managed: {id: number; name: string}[] = can(user, 'report.view.group')
      ? (await this.db.query('SELECT g.id, g.name FROM groups g JOIN group_managers m ON m."groupId"=g.id WHERE m."userId"=$1 ORDER BY g.name', [user.id])).rows
      : [];
    const scope = can(user, 'report.view.all') ? 'all' : managed.length ? 'group' : 'self';
    const userIds = scope === 'all' ? null
      : scope === 'self' ? [user.id]
      : [...new Set([user.id, ...(await this.db.query(
          'SELECT "userId" FROM group_members WHERE "groupId" = ANY($1)', [managed.map(group => group.id)])).rows.map(row => row.userId as number)])];
    return {scope, groups: managed.map(group => group.name), userIds};
  }
  /**
   * Süresi geçen task'lar: bitiş tarihi bugünden önce ve projesinin son
   * (tamamlandı) sütununda olmayanlar. `userIds` null ise atama sınırı yoktur.
   * Özet ekranı ve personel raporu aynı tanımı paylaşır.
   */
  async overdueTasks(projectIds: number[], userIds: number[] | null) {
    if (!projectIds.length) return [];
    return (await this.db.query(`
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
    const defined = (await this.db.query('SELECT 1 FROM workflow_transitions WHERE "projectId"=$1 LIMIT 1', [projectId])).rowCount;
    if (!defined) return true;
    return !!(await this.db.query(
      'SELECT 1 FROM workflow_transitions WHERE "projectId"=$1 AND "fromColumnId"=$2 AND "toColumnId"=$3',
      [projectId, fromColumnId, toColumnId],
    )).rowCount;
  }
  /** Kişinin yöneticisi olduğu grupların kimlikleri; duyuru hedefi ve yetki kontrolü buradan çıkar. */
  async managedGroupIds(userId: number): Promise<number[]> {
    return (await this.db.query('SELECT "groupId" FROM group_managers WHERE "userId"=$1 ORDER BY "groupId"', [userId]))
      .rows.map(row => row.groupId as number);
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
    return (await this.db.query(`
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
    await this.db.query(`
      INSERT INTO announcement_reads("announcementId","userId")
      SELECT a.id, $2 FROM announcements a WHERE a.id=$1 AND a.mandatory
      ON CONFLICT DO NOTHING`,
      [announcementId, userId],
    );
    await this.db.query(
      'UPDATE notifications SET "readAt"=NOW() WHERE "userId"=$1 AND "announcementId"=$2 AND "readAt" IS NULL',
      [userId, announcementId],
    );
  }
  /**
   * Duyuru bildirimi; task bildirimlerinden ayrı çünkü kaydın `taskId` alanı boştur.
   * Aynı kişiye aynı duyuru için ikinci bildirim yazılmaz, böylece duyuru düzenlenip
   * hedef kitlesi genişlediğinde yalnızca yeni kişiler haberdar edilir.
   */
  async notifyAnnouncement(userIds: number[], announcementId: number, actorId: number) {
    const ids = [...new Set(userIds)].filter(id => id !== actorId);
    if (!ids.length) return;
    await this.db.query(`
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
    await this.db.query(
      'INSERT INTO notifications("userId",type,"taskId","actorId") SELECT UNNEST($1::int[]),$2,$3,$4',
      [ids, type, taskId, actorId],
    );
  }
  /** Projenin son sütunu "tamamlandı" sayılır; rapor ve gecikme tanımıyla aynı kural. */
  async isFinalColumn(projectId: number, columnId: number) {
    const row = (await this.db.query(
      'SELECT id FROM columns WHERE "projectId"=$1 ORDER BY position DESC NULLS LAST, id DESC LIMIT 1', [projectId],
    )).rows[0] as {id: number} | undefined;
    return !!row && row.id === columnId;
  }
  /** Task tamamlandığında haberdar edilecekler: yöneticiler ve atanan kişinin grup yöneticileri. */
  async managerIds(assigneeId: number | null): Promise<number[]> {
    return (await this.db.query(`
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
    await this.db.query(
      `INSERT INTO activity_log("projectId","taskId","taskTitle",action,detail,"actorId","actorName")
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [entry.projectId, entry.taskId, entry.taskTitle, entry.action, entry.detail ?? null,
        entry.actor.id, `${entry.actor.name} ${entry.actor.surname}`.trim()],
    );
  }
  /** Sütunun bağlı olduğu proje; sütun yoksa 404. */
  async columnProject(columnId: number): Promise<number> {
    const row = (await this.db.query('SELECT "projectId" FROM columns WHERE id=$1', [columnId])).rows[0];
    if (!row) throw new NotFoundException('Sütun bulunamadı.');
    return row.projectId;
  }
}
