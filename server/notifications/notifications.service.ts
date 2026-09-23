import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { User } from '../common/fields.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { execute, query } from '../prisma/sql.ts';
import { NotifierService } from '../workspace/notifier.service.ts';

@Injectable()
export class NotificationsService {
  constructor(@Inject(NotifierService) private notifier: NotifierService, @Inject(PrismaService) private prisma: PrismaService) { }
  private async list(userId: number) {
    const items = await query(this.prisma, `
      SELECT n.id, n.type, n."taskId", n."announcementId", n."readAt", n."createdAt",
        t.title AS "taskTitle", t.type AS "taskType",
        p.id AS "projectId", p.name AS "projectName",
        an.title AS "announcementTitle", an.mandatory AS "announcementMandatory",
        NULLIF(TRIM(CONCAT_WS(' ', a.name, a.surname)), '') AS "actorName"
      FROM notifications n
      LEFT JOIN tasks t ON t.id=n."taskId"
      LEFT JOIN columns c ON c.id=t."columnId"
      LEFT JOIN projects p ON p.id=c."projectId"
      LEFT JOIN announcements an ON an.id=n."announcementId"
      LEFT JOIN users a ON a.id=n."actorId"
      WHERE n."userId"=$1
      ORDER BY n."createdAt" DESC, n.id DESC
      LIMIT 50`, [userId]);
    const unread = await this.prisma.notification.count({ where: { userId, readAt: null } });
    return { items, unread };
  }
  all(user: User) { return this.list(user.id); }
  async read(user: User, notificationId: number) {
    const row = await this.prisma.notification.findFirst({ where: { id: notificationId, userId: user.id }, select: { announcementId: true } });
    // Zaten okunmuş bildirim hata değildir; yalnızca gerçekten yoksa 404.
    if (!row) throw new NotFoundException('Bildirim bulunamadı.');
    await this.prisma.notification.updateMany({ where: { id: notificationId, userId: user.id, readAt: null }, data: { readAt: new Date() } });
    // Duyuru bildirimi okunduğunda duyuru da okunmuş sayılır; kişi ikinci kez işaretlemez.
    if (row.announcementId !== null) await this.notifier.readAnnouncement(user.id, row.announcementId);
    return this.list(user.id);
  }
  async readAll(user: User) {
    // Duyuru bildirimleri okundu sayıldığında duyurunun kendisi de okunmuş olur.
    // Okuma kaydı yalnızca zorunlu duyurularda tutulur; raporu olan tek tür odur.
    await execute(this.prisma, `
      INSERT INTO announcement_reads("announcementId","userId")
      SELECT DISTINCT n."announcementId", n."userId" FROM notifications n
      JOIN announcements a ON a.id = n."announcementId" AND a.mandatory
      WHERE n."userId"=$1 AND n."readAt" IS NULL
      ON CONFLICT DO NOTHING`, [user.id]);
    await this.prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
    return this.list(user.id);
  }
}
