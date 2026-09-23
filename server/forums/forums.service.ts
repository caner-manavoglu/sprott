import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { basename } from 'node:path';
import { admin, allow, type AuthRequest } from '../common/auth.ts';
import { idField, textField, type User } from '../common/fields.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { sql } from '../prisma/sql.ts';
import { WorkspaceService } from '../workspace/workspace.service.ts';
import { type EditMessageDto, type MessageReceiptsDto, type SaveForumDto, type SendMessageDto } from './dto/forums.dto.ts';

type Upload = { originalname: string; mimetype: string; buffer: Buffer; size: number };

@Injectable()
export class ForumsService {
  constructor(@Inject(WorkspaceService) private workspace: WorkspaceService, @Inject(PrismaService) private prisma: PrismaService) { }
  private async forum(id: number) {
    const row = (await this.prisma.forum.findFirst({ where: { id }, select: { id: true, name: true, description: true }, }));
    if (!row) throw new NotFoundException('Forum bulunamadı.');
    return row;
  }
  private async access(user: User, id: number) {
    const forum = await this.forum(id);
    if (user.role !== 'admin' && !(await this.prisma.forumMember.count({ where: { forumId: id, userId: user.id, status: "joined" }, }))) throw new ForbiddenException('Sohbet için forum üyeliğiniz onaylanmalı.');
    return forum;
  }
  async list(req: AuthRequest) {
    const user = allow(req, 'forum.view');
    return (await sql(this.prisma, `SELECT f.id,f.name,f.description,f."createdAt",f."imageVersion",(f."imageContent" IS NOT NULL) AS "hasImage",m.status,
      (SELECT COUNT(*)::int FROM forum_members WHERE "forumId"=f.id AND status='joined') AS "memberCount",
      CASE WHEN $2 THEN (SELECT COUNT(*)::int FROM forum_members WHERE "forumId"=f.id AND status='pending') ELSE 0 END AS "requestCount"
      FROM forums f LEFT JOIN forum_members m ON m."forumId"=f.id AND m."userId"=$1 ORDER BY f.id DESC`, [user.id, user.role === 'admin'])).rows;
  }
  private image(file?: Upload) {
    if (!file) return null;
    const bytes = file.buffer;
    const mime = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png'
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg'
        : ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString()) ? 'image/gif'
          : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP' ? 'image/webp' : null;
    if (!mime) throw new BadRequestException('Forum görseli JPG, PNG, GIF veya WebP olmalı.');
    return { content: bytes, mime };
  }
  async imageFile(req: AuthRequest, raw: string, response: Response) {
    allow(req, 'forum.view');
    const file = (await this.prisma.forum.findFirst({ where: { id: idField(raw) }, select: { imageContent: true, imageMimeType: true }, }));
    if (!file?.imageContent) throw new NotFoundException('Forum görseli bulunamadı.');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.type(file.imageMimeType || 'application/octet-stream').send(Buffer.from(file.imageContent));
  }
  async create(req: AuthRequest, body: SaveForumDto, file?: Upload) {
    const user = allow(req, 'forum.create');
    const name = textField(body.name, 'Forum adı', 100), description = this.description(body.description), image = this.image(file);
    return this.workspace.transaction(async client => {
      const forum = (await client.forum.create({ data: { name, description, createdBy: user.id, imageContent: image ? new Uint8Array(image.content) : null, imageMimeType: image?.mime ?? null, imageVersion: image ? 1 : 0 }, select: { id: true } }));
      await client.forumMember.create({ data: { forumId: forum.id, userId: user.id, status: 'joined' } });
      return forum;
    });
  }
  private description(value: unknown) {
    if (typeof value !== 'string' || value.length > 2000) throw new BadRequestException('Açıklama en fazla 2000 karakter olmalı.');
    return value.trim();
  }
  async update(req: AuthRequest, raw: string, body: SaveForumDto, file?: Upload) {
    allow(req, 'forum.update'); const id = idField(raw); await this.forum(id);
    const image = this.image(file);
    await this.prisma.forum.update({
      where: { id }, data: {
        name: textField(body.name, 'Forum adı', 100), description: this.description(body.description),
        ...(image ? { imageContent: new Uint8Array(image.content), imageMimeType: image.mime, imageVersion: { increment: 1 } } : {}),
      }
    });
    return { ok: true };
  }
  async remove(req: AuthRequest, raw: string) {
    allow(req, 'forum.delete');
    if (!((await this.prisma.forum.deleteMany({ where: { id: idField(raw) }, })).count)) throw new NotFoundException('Forum bulunamadı.');
    return { ok: true };
  }
  async join(req: AuthRequest, raw: string) {
    const user = allow(req, 'forum.view'), id = idField(raw); await this.forum(id);
    await this.prisma.forumMember.createMany({ data: [{ forumId: id, userId: user.id, status: 'pending' }], skipDuplicates: true });
    return { ok: true };
  }
  async people(req: AuthRequest, raw: string) {
    admin(req); await this.forum(idField(raw));
    return (await sql(this.prisma, `SELECT u.id,u.name,u.surname,u.title,(u."avatarContent" IS NOT NULL) AS "hasAvatar",m.status
      FROM users u LEFT JOIN forum_members m ON m."userId"=u.id AND m."forumId"=$1 ORDER BY u.name,u.surname`, [idField(raw)])).rows;
  }
  async add(req: AuthRequest, raw: string, person: string) {
    admin(req); const id = idField(raw), userId = idField(person); await this.forum(id);
    if (!(await this.prisma.user.count({ where: { id: userId }, }))) throw new NotFoundException('Kullanıcı bulunamadı.');
    await this.prisma.forumMember.upsert({ where: { forumId_userId: { forumId: id, userId } }, create: { forumId: id, userId, status: 'joined' }, update: { status: 'joined' } });
    return { ok: true };
  }
  async reject(req: AuthRequest, raw: string, person: string) {
    admin(req); await this.forum(idField(raw));
    await this.prisma.forumMember.deleteMany({ where: { forumId: idField(raw), userId: idField(person) }, });
    return { ok: true };
  }
  async deliveries(req: AuthRequest) {
    const user = allow(req, 'forum.view');
    return (await sql(this.prisma, `SELECT m.id,m.body,m."forumId",m."authorId",m."createdAt",
      COALESCE((SELECT json_agg(json_build_object('id',f.id,'name',f.name,'mimeType',f."mimeType",'size',f.size)) FROM forum_files f WHERE f."messageId"=m.id),'[]') AS files
      FROM forum_message_receipts r
      JOIN forum_messages m ON m.id=r."messageId" JOIN forum_members fm ON fm."forumId"=m."forumId" AND fm."userId"=r."userId"
      WHERE r."userId"=$1 AND r."deliveredAt" IS NULL AND m."deletedAt" IS NULL AND fm.status='joined'
      AND NOT EXISTS(SELECT 1 FROM forum_message_hidden h WHERE h."messageId"=m.id AND h."userId"=$1)
      ORDER BY r."messageId" LIMIT 500`, [user.id])).rows;
  }
  async receipts(req: AuthRequest, body: MessageReceiptsDto, response: Response) {
    const user = allow(req, 'forum.view');
    if (!Array.isArray(body.ids) || body.ids.length > 500 || !['delivered', 'read'].includes(String(body.kind))) throw new BadRequestException('Geçersiz mesaj bilgisi.');
    const ids = [...new Set(body.ids.map(idField))], read = body.kind === 'read';
    const result = await sql(this.prisma, `UPDATE forum_message_receipts r SET "deliveredAt"=COALESCE(r."deliveredAt",NOW()),
      "readAt"=CASE WHEN $3 THEN COALESCE(r."readAt",NOW()) ELSE r."readAt" END
      FROM forum_messages m, forum_members fm WHERE m.id=r."messageId" AND fm."forumId"=m."forumId" AND fm."userId"=$1 AND fm.status='joined'
      AND r."userId"=$1 AND r."messageId"=ANY($2::int[]) AND m."deletedAt" IS NULL
      AND (r."deliveredAt" IS NULL OR ($3 AND r."readAt" IS NULL))`, [user.id, ids, read]);
    response.locals.liveChanged = !!result.rowCount;
    return { ok: true };
  }
  async messages(req: AuthRequest, raw: string, before?: string) {
    const user = allow(req, 'forum.view'), id = idField(raw); await this.access(user, id);
    return (await sql(this.prisma, `SELECT m.id,CASE WHEN h."userId" IS NOT NULL THEN '' ELSE m.body END AS body,m."createdAt",m."authorId",m."editedAt",m."deletedAt",(h."userId" IS NOT NULL) AS hidden,
      COALESCE(u.name,'Silinmiş kullanıcı') AS name,COALESCE(u.surname,'') AS surname,(u."avatarContent" IS NOT NULL) AS "hasAvatar",
      CASE WHEN h."userId" IS NOT NULL THEN '[]'::json ELSE COALESCE((SELECT json_agg(json_build_object('id',f.id,'name',f.name,'mimeType',f."mimeType",'size',f.size) ORDER BY f.id) FROM forum_files f WHERE f."messageId"=m.id),'[]') END AS files,
      (SELECT r."readAt" FROM forum_message_receipts r WHERE r."messageId"=m.id AND r."userId"=$3) AS "myReadAt",
      EXISTS(SELECT 1 FROM forum_message_receipts r WHERE r."messageId"=m.id AND r."userId"=$3) AS "isRecipient",
      CASE WHEN m."authorId"=$3 THEN (SELECT json_build_object('total',COUNT(*),'delivered',COUNT("deliveredAt"),'read',COUNT("readAt")) FROM forum_message_receipts r WHERE r."messageId"=m.id) ELSE NULL END AS receipts
      FROM forum_messages m LEFT JOIN users u ON u.id=m."authorId"
      LEFT JOIN forum_message_hidden h ON h."messageId"=m.id AND h."userId"=$3
      WHERE m."forumId"=$1 AND ($2::int IS NULL OR m.id<$2) ORDER BY m.id DESC LIMIT 50`, [id, before ? idField(before) : null, user.id])).rows.reverse();
  }
  async send(req: AuthRequest, raw: string, body: SendMessageDto, files: { originalname: string; mimetype: string; buffer: Buffer; size: number }[] = []) {
    const user = allow(req, 'forum.view'), id = idField(raw); await this.access(user, id);
    if (typeof body.body !== 'string' || body.body.trim().length > 5000 || (!body.body.trim() && !files.length)) throw new BadRequestException('Mesaj yazın veya dosya seçin (en fazla 5000 karakter).');
    const messageBody = body.body.trim();
    const uploads = files.map(file => {
      if (!file.buffer.length) throw new BadRequestException('Boş dosya gönderilemez.');
      return { ...file, originalname: textField(basename(file.originalname).replaceAll('\0', ''), 'Dosya adı', 255) };
    });
    return this.workspace.transaction(async client => {
      const message = (await client.forumMessage.create({ data: { forumId: id, authorId: user.id, body: messageBody, receiptsInitialized: true }, select: { id: true } }));
      for (const file of uploads) (await client.forumFile.create({ data: { messageId: message.id, name: file.originalname, mimeType: file.mimetype, size: file.size, content: new Uint8Array(file.buffer) } }));
      const recipients = await client.forumMember.findMany({ where: { forumId: id, status: 'joined', userId: { not: user.id } }, select: { userId: true } });
      await client.forumMessageReceipt.createMany({ data: recipients.map(({ userId }) => ({ messageId: message.id, userId })) });
      return message;
    });
  }
  async file(req: AuthRequest, raw: string, fileId: string, response: Response) {
    const user = allow(req, 'forum.view'), id = idField(raw); await this.access(user, id);
    const file = (await sql(this.prisma, `SELECT f.* FROM forum_files f JOIN forum_messages m ON m.id=f."messageId" WHERE f.id=$1 AND m."forumId"=$2 AND m."deletedAt" IS NULL AND NOT EXISTS(SELECT 1 FROM forum_message_hidden h WHERE h."messageId"=m.id AND h."userId"=$3)`, [idField(fileId), id, user.id])).rows[0];
    if (!file) throw new NotFoundException('Dosya bulunamadı.');
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    response.send(file.content);
  }
  async editMessage(req: AuthRequest, raw: string, rawMessage: string, body: EditMessageDto) {
    const user = allow(req, 'forum.view'), id = idField(raw); await this.access(user, id);
    const result = await this.prisma.forumMessage.updateMany({ where: { id: idField(rawMessage), forumId: id, authorId: user.id, deletedAt: null }, data: { body: textField(body.body, 'Mesaj', 5000), editedAt: new Date() } });
    if (!result.count) throw new ForbiddenException('Yalnızca kendi silinmemiş mesajınızı düzenleyebilirsiniz.');
    return { ok: true };
  }
  async deleteMessage(req: AuthRequest, raw: string, rawMessage: string, scope: string) {
    const user = allow(req, 'forum.view'), id = idField(raw), messageId = idField(rawMessage); await this.access(user, id);
    if (!['me', 'everyone'].includes(scope)) throw new BadRequestException('Silme kapsamını seçin.');
    await this.workspace.transaction(async client => {
      const message = (await sql(client, 'SELECT "authorId" FROM forum_messages WHERE id=$1 AND "forumId"=$2 FOR UPDATE', [messageId, id])).rows[0];
      if (!message) throw new NotFoundException('Mesaj bulunamadı.');
      if (scope === 'me') { await client.forumMessageHidden.createMany({ data: [{ messageId, userId: user.id }], skipDuplicates: true }); return; }
      if (message.authorId !== user.id) throw new ForbiddenException('Yalnızca kendi mesajınızı herkesten silebilirsiniz.');
      await client.forumMessage.updateMany({ where: { id: messageId, deletedAt: null }, data: { body: '', deletedAt: new Date() } });
      await client.forumFile.deleteMany({ where: { messageId }, });
    });
    return { ok: true };
  }
  async messageReceipts(req: AuthRequest, raw: string, rawMessage: string) {
    const user = allow(req, 'forum.view'), id = idField(raw), messageId = idField(rawMessage); await this.access(user, id);
    if (!(await this.prisma.forumMessage.count({ where: { id: messageId, forumId: id, authorId: user.id }, }))) throw new ForbiddenException('Yalnızca kendi mesajınızın bilgisini görebilirsiniz.');
    return (await sql(this.prisma, `SELECT u.id,u.name,u.surname,(u."avatarContent" IS NOT NULL) AS "hasAvatar",r."deliveredAt",r."readAt" FROM forum_message_receipts r JOIN users u ON u.id=r."userId" WHERE r."messageId"=$1 ORDER BY u.name,u.surname`, [messageId])).rows;
  }
}
