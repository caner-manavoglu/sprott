import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Inject, NotFoundException, Param, Patch, Post, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { basename } from 'node:path';
import { Store, idField, textField, type User } from '../store.ts';
import { type AuthRequest, current } from '../common/auth.ts';
import { announcementDetailSchema, announcementsSchema, editAnnouncementSchema, newAnnouncementSchema } from './announcements.schemas.ts';

type Upload = {originalname: string; mimetype: string; size: number; buffer: Buffer};
const imageOptions = {limits: {fileSize: 10 * 1024 * 1024}};
/** Kişi kartı; okuyan/okumayan listeleri ve duyuru sahibi aynı biçimi paylaşır. */
const person = (alias: string, extra = '') =>
  `json_build_object('id', ${alias}.id, 'name', NULLIF(TRIM(CONCAT_WS(' ', ${alias}.name, ${alias}.surname)), ''), 'title', ${alias}.title, 'hasAvatar', (${alias}."avatarContent" IS NOT NULL)${extra})`;

@ApiTags('Duyurular')
@ApiBearerAuth('bearer')
@ApiResponse({status: 401, description: 'Oturum gerekli.'})
@ApiResponse({status: 403, description: 'Yetki reddedildi.'})
@Controller('api/announcements')
export class AnnouncementsController {
  constructor(@Inject(Store) private store: Store) {}
  /**
   * Duyuruyu kim görür: hedef grubu olmayan duyuruyu herkes, hedefi olanı o grupların
   * üyeleri görür. Duyuruyu yazan kişi kendi duyurusunu, yöneticiler ise denetim için
   * tüm duyuruları görür.
   */
  private static readonly VISIBLE = `(
    $2::boolean OR a."createdBy" = $1
    OR NOT EXISTS (SELECT 1 FROM announcement_groups ag WHERE ag."announcementId" = a.id)
    OR EXISTS (SELECT 1 FROM announcement_groups ag JOIN group_members m ON m."groupId" = ag."groupId"
               WHERE ag."announcementId" = a.id AND m."userId" = $1)
  )`;
  /** `announcementId` verilirse liste tek duyuruya daralır; görünürlük kuralı aynı kalır. */
  private async list(user: User, announcementId?: number) {
    return (await this.store.db.query(`
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
      WHERE ${AnnouncementsController.VISIBLE} AND ($3::int IS NULL OR a.id = $3)
      ORDER BY a."createdAt" DESC, a.id DESC`,
      [user.id, user.role === 'admin', announcementId ?? null])).rows;
  }
  /** Duyuruyu yazan kişi ve yöneticiler okuma raporunu görebilir, duyuruyu düzenleyebilir ve silebilir. */
  private async manageable(user: User, announcementId: number) {
    const row = (await this.store.db.query(
      'SELECT "createdBy", mandatory FROM announcements WHERE id=$1', [announcementId],
    )).rows[0] as {createdBy: number | null; mandatory: boolean} | undefined;
    if (!row) throw new NotFoundException('Duyuru bulunamadı.');
    if (user.role !== 'admin' && row.createdBy !== user.id) throw new ForbiddenException('Bu duyuru sizin değil.');
    return row;
  }
  /**
   * Hedef gruplar. Yönetici boş bırakabilir, o zaman duyuru herkese açılır.
   * Grup yöneticisi yalnızca yönettiği grupları seçebilir; boş bırakırsa
   * duyuru yönettiği tüm gruplara gider, herkese açılamaz.
   */
  private async targetGroups(user: User, value: unknown) {
    let raw = value;
    if (typeof raw === 'string' && raw.trim()) {
      try { raw = JSON.parse(raw); } catch { throw new BadRequestException('Hedef grup listesi geçersiz.'); }
    }
    if (raw === '' || raw === undefined || raw === null) raw = [];
    if (!Array.isArray(raw)) throw new BadRequestException('Hedef grup listesi geçersiz.');
    const ids = [...new Set(raw.map(idField))];
    if (user.role === 'admin') {
      if (ids.length && (await this.store.db.query('SELECT id FROM groups WHERE id = ANY($1)', [ids])).rowCount !== ids.length) {
        throw new BadRequestException('Seçilen gruplardan biri bulunamadı.');
      }
      return ids;
    }
    const managed = await this.store.managedGroupIds(user.id);
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
      content: file.buffer,
    };
  }

  @ApiOperation({summary: 'Bana açık duyurular'})
  @ApiResponse({status: 200, schema: announcementsSchema})
  @Get() index(@Req() req: AuthRequest) { return this.list(current(req)); }

  // ':id' rotasından önce tanımlı olmalı, yoksa 'pending' bir kimlik sanılır.
  @ApiOperation({summary: 'Girişte açılacak zorunlu duyurular: bana açık, zorunlu ve henüz okumadıklarım'})
  @ApiResponse({status: 200, schema: announcementsSchema})
  @Get('pending') async pending(@Req() req: AuthRequest) {
    const user = current(req);
    // Yönetici yalnızca gerçekten kendisini hedefleyen duyuruların modalını görür;
    // denetim için listede görünen diğer grupların duyuruları burada elenir.
    return (await this.store.db.query(`
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

  // ':id' rotasından önce tanımlı olmalı, yoksa 'groups' bir kimlik sanılır.
  @ApiOperation({summary: 'Duyuru yapabileceğim gruplar: yönetici için tümü, grup yöneticisi için yönettikleri'})
  @ApiResponse({status: 200, description: 'Grup listesi.'})
  @Get('groups') async audience(@Req() req: AuthRequest) {
    const user = current(req);
    if (!await this.store.canAnnounce(user)) throw new ForbiddenException('Duyuru oluşturma yetkiniz bulunmuyor.');
    if (user.role === 'admin') return (await this.store.db.query('SELECT id, name FROM groups ORDER BY name')).rows;
    return (await this.store.db.query(
      'SELECT g.id, g.name FROM group_managers m JOIN groups g ON g.id=m."groupId" WHERE m."userId"=$1 ORDER BY g.name', [user.id],
    )).rows;
  }

  @ApiOperation({summary: 'Duyuru oluştur (yönetici veya duyuru yetkisi olan grup yöneticisi)'})
  @ApiConsumes('multipart/form-data')
  @ApiBody({schema: newAnnouncementSchema})
  @ApiResponse({status: 400, description: 'Geçersiz istek.'})
  @ApiResponse({status: 201, schema: announcementsSchema})
  @Post()
  @UseInterceptors(FileInterceptor('image', imageOptions))
  async create(@Req() req: AuthRequest, @Body() body: Record<string, unknown>, @UploadedFile() upload?: Upload) {
    const user = current(req);
    if (!await this.store.canAnnounce(user)) throw new ForbiddenException('Duyuru oluşturma yetkiniz bulunmuyor.');
    const title = textField(body.title, 'Duyuru başlığı', 160), text = textField(body.body, 'Duyuru açıklaması', 5000);
    // multipart alanları metin gelir; onay kutusu 'true' dizesine dönüşür.
    const mandatory = body.mandatory === true || body.mandatory === 'true';
    const groupIds = await this.targetGroups(user, body.groupIds);
    const image = this.image(upload);
    const announcementId = await this.store.transaction(async client => {
      const created = (await client.query(
        `INSERT INTO announcements(title,body,mandatory,"imageName","imageMimeType","imageSize","imageContent","createdBy")
         VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [title, text, mandatory, image?.name ?? null, image?.mimeType ?? null, image?.size ?? null, image?.content ?? null, user.id],
      )).rows[0].id as number;
      if (groupIds.length) {
        await client.query('INSERT INTO announcement_groups("announcementId","groupId") SELECT $1, UNNEST($2::int[])', [created, groupIds]);
      }
      return created;
    });
    await this.store.notifyAnnouncement(await this.store.announcementAudience(announcementId), announcementId, user.id);
    return this.list(user);
  }

  @ApiOperation({summary: 'Duyuruyu düzenle (duyuruyu yazan kişi veya yönetici); zorunlu duyurular düzenlenemez'})
  @ApiParam({name: 'id', type: Number, example: 1})
  @ApiConsumes('multipart/form-data')
  @ApiBody({schema: editAnnouncementSchema})
  @ApiResponse({status: 400, description: 'Geçersiz istek.'})
  @ApiResponse({status: 403, description: 'Zorunlu duyuru düzenlenemez.'})
  @ApiResponse({status: 200, schema: announcementsSchema})
  @Patch(':id')
  @UseInterceptors(FileInterceptor('image', imageOptions))
  async update(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: Record<string, unknown>, @UploadedFile() upload?: Upload) {
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
    await this.store.transaction(async client => {
      await client.query('UPDATE announcements SET title=$1, body=$2 WHERE id=$3', [title, text, announcementId]);
      if (image || clearImage) {
        await client.query(
          'UPDATE announcements SET "imageName"=$1, "imageMimeType"=$2, "imageSize"=$3, "imageContent"=$4 WHERE id=$5',
          [image?.name ?? null, image?.mimeType ?? null, image?.size ?? null, image?.content ?? null, announcementId],
        );
      }
      await client.query('DELETE FROM announcement_groups WHERE "announcementId"=$1', [announcementId]);
      if (groupIds.length) {
        await client.query('INSERT INTO announcement_groups("announcementId","groupId") SELECT $1, UNNEST($2::int[])', [announcementId, groupIds]);
      }
    });
    // Hedef kitle genişlediyse yeni kişilere bildirim düşer; bildirimi olanlar iki kez uyarılmaz.
    await this.store.notifyAnnouncement(await this.store.announcementAudience(announcementId), announcementId, user.id);
    return this.list(user);
  }

  @ApiOperation({summary: 'Zorunlu duyuruyu okundu işaretle; aynı duyurunun bildirimi de okunmuş sayılır'})
  @ApiParam({name: 'id', type: Number, example: 1})
  @ApiResponse({status: 400, description: 'Zorunlu olmayan duyuruda okundu takibi yapılmaz.'})
  @ApiResponse({status: 200, schema: announcementsSchema})
  @Patch(':id/read') async read(@Req() req: AuthRequest, @Param('id') id: string) {
    const user = current(req), announcementId = idField(id);
    const [announcement] = await this.list(user, announcementId);
    if (!announcement) throw new NotFoundException('Duyuru bulunamadı.');
    if (!announcement.mandatory) throw new BadRequestException('Yalnızca zorunlu duyurularda okundu takibi yapılır.');
    await this.store.readAnnouncement(user.id, announcementId);
    return this.list(user);
  }

  @ApiOperation({summary: 'Duyuru görselini indir'})
  @ApiParam({name: 'id', type: Number, example: 1})
  @ApiResponse({status: 200, description: 'Görsel içeriği.'})
  @Get(':id/image') async picture(@Req() req: AuthRequest, @Param('id') id: string, @Res() response: Response) {
    const user = current(req), announcementId = idField(id);
    if (!(await this.list(user, announcementId)).length) throw new NotFoundException('Duyuru bulunamadı.');
    const file = (await this.store.db.query(
      'SELECT "imageName","imageMimeType","imageContent" FROM announcements WHERE id=$1 AND "imageContent" IS NOT NULL', [announcementId],
    )).rows[0];
    if (!file) throw new NotFoundException('Duyurunun görseli yok.');
    response.setHeader('Content-Type', file.imageMimeType);
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.imageName)}`);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.send(file.imageContent);
  }

  @ApiOperation({summary: 'Zorunlu duyurunun okuma raporu (duyuruyu yazan kişi veya yönetici)'})
  @ApiParam({name: 'id', type: Number, example: 1})
  @ApiResponse({status: 400, description: 'Zorunlu olmayan duyurunun okuma raporu tutulmaz.'})
  @ApiResponse({status: 404, description: 'Duyuru bulunamadı.'})
  @ApiResponse({status: 200, schema: announcementDetailSchema})
  @Get(':id') async detail(@Req() req: AuthRequest, @Param('id') id: string) {
    const user = current(req), announcementId = idField(id);
    // Okuma raporu zorunlu duyurunun onay kaydıdır; diğer duyurularda okundu tutulmaz.
    if (!(await this.manageable(user, announcementId)).mandatory) {
      throw new BadRequestException('Okuma raporu yalnızca zorunlu duyurular için tutulur.');
    }
    const [announcement] = await this.list(user, announcementId);
    const audience = await this.store.announcementAudience(announcementId);
    const readers = (await this.store.db.query(`
      SELECT ${person('u', `, 'readAt', r."readAt"`)} AS row
      FROM announcement_reads r JOIN users u ON u.id = r."userId"
      WHERE r."announcementId" = $1 AND u.id = ANY($2)
      ORDER BY r."readAt" DESC`, [announcementId, audience])).rows.map(row => row.row);
    const pending = (await this.store.db.query(`
      SELECT ${person('u')} AS row FROM users u
      WHERE u.id = ANY($2) AND NOT EXISTS (SELECT 1 FROM announcement_reads r WHERE r."announcementId" = $1 AND r."userId" = u.id)
      ORDER BY u.name, u.surname`, [announcementId, audience])).rows.map(row => row.row);
    return {announcement, readers, pending};
  }

  @ApiOperation({summary: 'Duyuruyu sil (duyuruyu yazan kişi veya yönetici)'})
  @ApiParam({name: 'id', type: Number, example: 1})
  @ApiResponse({status: 200, schema: announcementsSchema})
  @Delete(':id') async remove(@Req() req: AuthRequest, @Param('id') id: string) {
    const user = current(req), announcementId = idField(id);
    await this.manageable(user, announcementId);
    await this.store.db.query('DELETE FROM announcements WHERE id=$1', [announcementId]);
    return this.list(user);
  }
}
