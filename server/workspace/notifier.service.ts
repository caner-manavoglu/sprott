import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.ts';
import { execute, query } from '../prisma/sql.ts';

/** Bildirim yazma ve duyuru okundu kaydı; task, duyuru ve bildirim modülleri paylaşır. */
@Injectable()
export class NotifierService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) { }
  /** Bildirim yazar. Kendi eylemi kimseye bildirilmez, bu yüzden `actorId` listeden çıkarılır. */
  async notify(userIds: (number | null)[], type: 'assigned' | 'completed' | 'mention' | 'comment', taskId: number, actorId: number) {
    const ids = [...new Set(userIds)].filter((id): id is number => typeof id === 'number' && id !== actorId);
    if (!ids.length) return;
    await this.prisma.notification.createMany({ data: ids.map(userId => ({ userId, type, taskId, actorId })) });
  }
  /** Task tamamlandığında haberdar edilecekler: yöneticiler ve atanan kişinin grup yöneticileri. */
  async managerIds(assigneeId: number | null): Promise<number[]> {
    return (await query<{ id: number }>(this.prisma, `
      SELECT id FROM users WHERE role='admin'
      UNION
      SELECT gm."userId" FROM group_managers gm JOIN group_members m ON m."groupId"=gm."groupId"
      WHERE $1::int IS NOT NULL AND m."userId"=$1`, [assigneeId])).map(row => row.id);
  }
  /**
   * Duyuruyu görecek kişiler: hedef grubu yoksa tüm kullanıcılar, varsa o grupların üyeleri.
   * Duyuruyu yazan kişi de listeye girer, böylece kendi duyurusunu listesinde görür.
   */
  async announcementAudience(announcementId: number): Promise<number[]> {
    return (await query<{ id: number }>(this.prisma, `
      SELECT u.id FROM users u
      WHERE NOT EXISTS (SELECT 1 FROM announcement_groups WHERE "announcementId"=$1)
         OR u.id IN (SELECT m."userId" FROM group_members m JOIN announcement_groups ag ON ag."groupId"=m."groupId" WHERE ag."announcementId"=$1)
         OR u.id = (SELECT "createdBy" FROM announcements WHERE id=$1)
      ORDER BY u.id`, [announcementId])).map(row => row.id);
  }
  /**
   * Duyuru bildirimi; task bildirimlerinden ayrı çünkü kaydın `taskId` alanı boştur.
   * Aynı kişiye aynı duyuru için ikinci bildirim yazılmaz, böylece duyuru düzenlenip
   * hedef kitlesi genişlediğinde yalnızca yeni kişiler haberdar edilir.
   */
  async notifyAnnouncement(announcementId: number, actorId: number) {
    const ids = (await this.announcementAudience(announcementId)).filter(id => id !== actorId);
    if (!ids.length) return;
    await execute(this.prisma, `
      INSERT INTO notifications("userId",type,"announcementId","actorId")
      SELECT candidate.id, 'announcement', $2, $3 FROM UNNEST($1::int[]) AS candidate(id)
      WHERE NOT EXISTS (SELECT 1 FROM notifications n WHERE n."userId"=candidate.id AND n."announcementId"=$2)`,
      [ids, announcementId, actorId]);
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
    await execute(this.prisma, `
      INSERT INTO announcement_reads("announcementId","userId")
      SELECT a.id, $2 FROM announcements a WHERE a.id=$1 AND a.mandatory
      ON CONFLICT DO NOTHING`, [announcementId, userId]);
    await this.prisma.notification.updateMany({ where: { userId, announcementId, readAt: null }, data: { readAt: new Date() } });
  }
}
