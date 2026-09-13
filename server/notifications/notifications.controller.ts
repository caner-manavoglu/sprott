import { Controller, Get, Inject, NotFoundException, Param, Patch, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Store, idField } from '../store.ts';
import { type AuthRequest, current } from '../common/auth.ts';
import { notificationsSchema } from './notifications.schemas.ts';

@ApiTags('Bildirimler')
@ApiBearerAuth('bearer')
@ApiResponse({status: 401, description: 'Oturum gerekli.'})
@Controller('api/notifications')
export class NotificationsController {
  constructor(@Inject(Store) private store: Store) {}
  /** Kişinin son bildirimleri; metin istemcide üretilir, burada yalnızca canlı alanlar toplanır. */
  private async list(userId: number) {
    const items = (await this.store.db.query(`
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
      LIMIT 50`, [userId])).rows;
    const unread = (await this.store.db.query(
      'SELECT COUNT(*)::int AS count FROM notifications WHERE "userId"=$1 AND "readAt" IS NULL', [userId],
    )).rows[0].count as number;
    return {items, unread};
  }
  @ApiOperation({summary: 'Kendi bildirimlerim (son 50) ve okunmamış sayısı'})
  @ApiResponse({status: 200, schema: notificationsSchema})
  @Get() async all(@Req() req: AuthRequest) {
    return this.list(current(req).id);
  }
  @ApiOperation({summary: 'Tek bildirimi okundu işaretle'})
  @ApiResponse({status: 200, schema: notificationsSchema})
  @Patch(':id/read') async read(@Req() req: AuthRequest, @Param('id') id: string) {
    const user = current(req), notificationId = idField(id);
    const row = (await this.store.db.query(
      'SELECT "announcementId" FROM notifications WHERE id=$1 AND "userId"=$2', [notificationId, user.id],
    )).rows[0] as {announcementId: number | null} | undefined;
    // Zaten okunmuş bildirim hata değildir; yalnızca gerçekten yoksa 404.
    if (!row) throw new NotFoundException('Bildirim bulunamadı.');
    await this.store.db.query(
      'UPDATE notifications SET "readAt"=NOW() WHERE id=$1 AND "userId"=$2 AND "readAt" IS NULL', [notificationId, user.id],
    );
    // Duyuru bildirimi okunduğunda duyuru da okunmuş sayılır; kişi ikinci kez işaretlemez.
    if (row.announcementId !== null) await this.store.readAnnouncement(user.id, row.announcementId);
    return this.list(user.id);
  }
  @ApiOperation({summary: 'Tüm bildirimleri okundu işaretle'})
  @ApiResponse({status: 200, schema: notificationsSchema})
  @Patch('read') async readAll(@Req() req: AuthRequest) {
    const user = current(req);
    // Duyuru bildirimleri okundu sayıldığında duyurunun kendisi de okunmuş olur.
    // Okuma kaydı yalnızca zorunlu duyurularda tutulur; raporu olan tek tür odur.
    await this.store.db.query(`
      INSERT INTO announcement_reads("announcementId","userId")
      SELECT DISTINCT n."announcementId", n."userId" FROM notifications n
      JOIN announcements a ON a.id = n."announcementId" AND a.mandatory
      WHERE n."userId"=$1 AND n."readAt" IS NULL
      ON CONFLICT DO NOTHING`, [user.id]);
    await this.store.db.query('UPDATE notifications SET "readAt"=NOW() WHERE "userId"=$1 AND "readAt" IS NULL', [user.id]);
    return this.list(user.id);
  }
}
