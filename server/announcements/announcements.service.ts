import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { basename } from 'node:path';
import { current, type AuthRequest } from '../common/auth.ts';
import { idField, textField, type User } from '../common/fields.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { sql } from '../prisma/sql.ts';
import { WorkspaceService } from '../workspace/workspace.service.ts';
import { type CreateAnnouncementDto, type UpdateAnnouncementDto } from './dto/announcements.dto.ts';

type Upload = { originalname: string; mimetype: string; size: number; buffer: Buffer };
const person = (alias: string, extra = '') =>
  `json_build_object('id', ${alias}.id, 'name', NULLIF(TRIM(CONCAT_WS(' ', ${alias}.name, ${alias}.surname)), ''), 'title', ${alias}.title, 'hasAvatar', (${alias}."avatarContent" IS NOT NULL)${extra})`;

@Injectable()
export class AnnouncementsService {
  constructor(@Inject(WorkspaceService) private workspace: WorkspaceService, @Inject(PrismaService) private prisma: PrismaService) { }
  private static readonly VISIBLE = `(
    $2::boolean OR a."createdBy" = $1
    OR NOT EXISTS (SELECT 1 FROM announcement_groups ag WHERE ag."announcementId" = a.id)
    OR EXISTS (SELECT 1 FROM announcement_groups ag JOIN group_members m ON m."groupId" = ag."groupId"
               WHERE ag."announcementId" = a.id AND m."userId" = $1)
  )`;
  private async list(user: User, announcementId?: number) {
    return (await sql(this.prisma, `
      SELECT a.id, a.title, a.body, a.mandatory, a."createdAt",
        (a."imageContent" IS NOT NULL) AS "hasImage",
        CASE WHEN au.id IS NULL THEN NULL ELSE ${person('au')} END AS author,
        COALESCE((SELECT json_agg(json_build_object('id', g.id, 'name', g.name) ORDER BY g.name)
          FROM announcement_groups ag JOIN groups g ON g.id = ag."groupId" WHERE ag."announcementId" = a.id), '[]') AS groups,
        r."readAt",
        ($2::boolean OR a."createdBy" = $1) AS "canManage"
      FROM announcements a
      LEFT JOIN users au ON au.id = a."createdBy"
      LEFT JOIN announcement_reads r ON r."announcementId" = a.id AND r."userId" = $1
      WHERE ${AnnouncementsService.VISIBLE} AND ($3::int IS NULL OR a.id = $3)
      ORDER BY a."createdAt" DESC, a.id DESC`,
      [user.id, user.role === 'admin', announcementId ?? null])).rows;
  }
  private async manageable(user: User, announcementId: number) {
    const row = (await this.prisma.announcement.findFirst({ where: { id: announcementId }, select: { createdBy: true, mandatory: true }, })) as { createdBy: number | null; mandatory: boolean } | undefined;
    if (!row) throw new NotFoundException('Duyuru bulunamadı.');
    if (user.role !== 'admin' && row.createdBy !== user.id) throw new ForbiddenException('Bu duyuru sizin değil.');
    return row;
  }
  private async targetGroups(user: User, value: unknown) {
    let raw = value;
    if (typeof raw === 'string' && raw.trim()) {
      try { raw = JSON.parse(raw); } catch { throw new BadRequestException('Hedef grup listesi geçersiz.'); }
    }
    if (raw === '' || raw === undefined || raw === null) raw = [];
    if (!Array.isArray(raw)) throw new BadRequestException('Hedef grup listesi geçersiz.');
    const ids = [...new Set(raw.map(idField))];
    if (user.role === 'admin') {
      if (ids.length && (await this.prisma.group.count({ where: { id: { in: ids } }, })) !== ids.length) {
        throw new BadRequestException('Seçilen gruplardan biri bulunamadı.');
      }
      return ids;
    }
    const managed = await this.workspace.managedGroupIds(user.id);
    if (!managed.length) throw new ForbiddenException('Duyuru oluşturmak için grup yöneticisi olmalısınız.');
    if (!ids.length) return managed;
    const outside = ids.filter(groupId => !managed.includes(groupId));
    if (outside.length) throw new ForbiddenException('Yalnızca yönettiğiniz gruplara duyuru yapabilirsiniz.');
    return ids;
  }
  private image(file: Upload | undefined) {
    if (!file?.buffer?.length) return null;
    if (!file.mimetype?.startsWith('image/')) throw new BadRequestException('Duyuruya yalnızca görsel eklenebilir.');
    return {
      name: textField(basename(file.originalname).replaceAll('\0', ''), 'Görsel adı', 255),
      mimeType: file.mimetype.length <= 200 ? file.mimetype : 'application/octet-stream',
      size: file.size,
      content: new Uint8Array(file.buffer),
    };
  }
  index(req: AuthRequest) { return this.list(current(req)); }
  async pending(req: AuthRequest) {
    const user = current(req);
    // Yönetici yalnızca gerçekten kendisini hedefleyen duyuruların modalını görür;
    // denetim için listede görünen diğer grupların duyuruları burada elenir.
    return (await sql(this.prisma, `
      SELECT a.id, a.title, a.body, a.mandatory, a."createdAt",
        (a."imageContent" IS NOT NULL) AS "hasImage",
        CASE WHEN au.id IS NULL THEN NULL ELSE ${person('au')} END AS author,
        '[]'::json AS groups, NULL::timestamptz AS "readAt", FALSE AS "canManage"
      FROM announcements a
      LEFT JOIN users au ON au.id = a."createdBy"
      WHERE a.mandatory
        -- Duyuruyu yazan kişiye kendi duyurusunun modalı açılmaz.
        AND (a."createdBy" IS NULL OR a."createdBy" <> $1)
        AND NOT EXISTS (SELECT 1 FROM announcement_reads r WHERE r."announcementId" = a.id AND r."userId" = $1)
        AND (NOT EXISTS (SELECT 1 FROM announcement_groups ag WHERE ag."announcementId" = a.id)
             OR EXISTS (SELECT 1 FROM announcement_groups ag JOIN group_members m ON m."groupId" = ag."groupId"
                        WHERE ag."announcementId" = a.id AND m."userId" = $1))
      ORDER BY a."createdAt", a.id`, [user.id])).rows;
  }
  async audience(req: AuthRequest) {
    const user = current(req);
    if (!await this.workspace.canAnnounce(user)) throw new ForbiddenException('Duyuru oluşturma yetkiniz bulunmuyor.');
    if (user.role === 'admin') return (await this.prisma.group.findMany({ select: { id: true, name: true }, orderBy: [{ name: 'asc' }], }));
    return (await sql(this.prisma,
      'SELECT g.id, g.name FROM group_managers m JOIN groups g ON g.id=m."groupId" WHERE m."userId"=$1 ORDER BY g.name', [user.id],
    )).rows;
  }
  async create(req: AuthRequest, body: CreateAnnouncementDto, upload?: Upload) {
    const user = current(req);
    if (!await this.workspace.canAnnounce(user)) throw new ForbiddenException('Duyuru oluşturma yetkiniz bulunmuyor.');
    const title = textField(body.title, 'Duyuru başlığı', 160), text = textField(body.body, 'Duyuru açıklaması', 5000);
    // multipart alanları metin gelir; onay kutusu 'true' dizesine dönüşür.
    const mandatory = body.mandatory === true || body.mandatory === 'true';
    const groupIds = await this.targetGroups(user, body.groupIds);
    const image = this.image(upload);
    const announcementId = await this.workspace.transaction(async client => {
      const created = (await client.announcement.create({ data: { title, body: text, mandatory, imageName: image?.name ?? null, imageMimeType: image?.mimeType ?? null, imageSize: image?.size ?? null, imageContent: image ? new Uint8Array(image.content) : null, createdBy: user.id }, select: { id: true } })).id as number;
      if (groupIds.length) {
        await client.announcementGroup.createMany({ data: groupIds.map(groupId => ({ announcementId: created, groupId })) });
      }
      return created;
    });
    await this.workspace.notifyAnnouncement(await this.workspace.announcementAudience(announcementId), announcementId, user.id);
    return this.list(user);
  }
  async update(req: AuthRequest, id: string, body: UpdateAnnouncementDto, upload?: Upload) {
    const user = current(req), announcementId = idField(id);
    const existing = await this.manageable(user, announcementId);
    /*
     * Zorunlu duyuru, kişilerin "okudum" onayıyla kayıt altına alınır. Metni sonradan
     * değiştirmek bu onayı anlamsız kılacağı için zorunlu duyurular düzenlenmez;
     * değişiklik gerekiyorsa duyuru silinip yeniden yayımlanır.
     */
    if (existing.mandatory) throw new ForbiddenException('Zorunlu duyurular düzenlenemez. Gerekiyorsa silip yeniden yayımlayın.');
    const title = textField(body.title, 'Duyuru başlığı', 160), text = textField(body.body, 'Duyuru açıklaması', 5000);
    const groupIds = await this.targetGroups(user, body.groupIds);
    const image = this.image(upload);
    // Görsel yalnızca yenisi yüklendiğinde ya da açıkça kaldırıldığında değişir.
    const clearImage = body.removeImage === true || body.removeImage === 'true';
    await this.workspace.transaction(async client => {
      await client.announcement.update({
        where: { id: announcementId }, data: {
          title, body: text,
          ...(image || clearImage ? {
            imageName: image?.name ?? null, imageMimeType: image?.mimeType ?? null,
            imageSize: image?.size ?? null, imageContent: image ? new Uint8Array(image.content) : null
          } : {}),
        }
      });
      await client.announcementGroup.deleteMany({ where: { announcementId }, });
      if (groupIds.length) {
        await client.announcementGroup.createMany({ data: groupIds.map(groupId => ({ announcementId, groupId })) });
      }
    });
    // Hedef kitle genişlediyse yeni kişilere bildirim düşer; bildirimi olanlar iki kez uyarılmaz.
    await this.workspace.notifyAnnouncement(await this.workspace.announcementAudience(announcementId), announcementId, user.id);
    return this.list(user);
  }
  async read(req: AuthRequest, id: string) {
    const user = current(req), announcementId = idField(id);
    const [announcement] = await this.list(user, announcementId);
    if (!announcement) throw new NotFoundException('Duyuru bulunamadı.');
    if (!announcement.mandatory) throw new BadRequestException('Yalnızca zorunlu duyurularda okundu takibi yapılır.');
    await this.workspace.readAnnouncement(user.id, announcementId);
    return this.list(user);
  }
  async picture(req: AuthRequest, id: string, response: Response) {
    const user = current(req), announcementId = idField(id);
    if (!(await this.list(user, announcementId)).length) throw new NotFoundException('Duyuru bulunamadı.');
    const file = (await this.prisma.announcement.findFirst({ where: { id: announcementId, imageContent: { not: null } }, select: { imageName: true, imageMimeType: true, imageContent: true }, }));
    if (!file) throw new NotFoundException('Duyurunun görseli yok.');
    response.setHeader('Content-Type', file.imageMimeType || 'application/octet-stream');
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.imageName || 'image')}`);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.send(Buffer.from(file.imageContent!));
  }
  async detail(req: AuthRequest, id: string) {
    const user = current(req), announcementId = idField(id);
    // Okuma raporu zorunlu duyurunun onay kaydıdır; diğer duyurularda okundu tutulmaz.
    if (!(await this.manageable(user, announcementId)).mandatory) {
      throw new BadRequestException('Okuma raporu yalnızca zorunlu duyurular için tutulur.');
    }
    const [announcement] = await this.list(user, announcementId);
    const audience = await this.workspace.announcementAudience(announcementId);
    const readers = (await sql(this.prisma, `
      SELECT ${person('u', `, 'readAt', r."readAt"`)} AS row
      FROM announcement_reads r JOIN users u ON u.id = r."userId"
      WHERE r."announcementId" = $1 AND u.id = ANY($2)
      ORDER BY r."readAt" DESC`, [announcementId, audience])).rows.map(row => row.row);
    const pending = (await sql(this.prisma, `
      SELECT ${person('u')} AS row FROM users u
      WHERE u.id = ANY($2) AND NOT EXISTS (SELECT 1 FROM announcement_reads r WHERE r."announcementId" = $1 AND r."userId" = u.id)
      ORDER BY u.name, u.surname`, [announcementId, audience])).rows.map(row => row.row);
    return { announcement, readers, pending };
  }
  async remove(req: AuthRequest, id: string) {
    const user = current(req), announcementId = idField(id);
    await this.manageable(user, announcementId);
    await this.prisma.announcement.deleteMany({ where: { id: announcementId }, });
    return this.list(user);
  }
}
