import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Inject, Module, NotFoundException, Param, Patch, Post, Query, Req, Res, UploadedFile, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { basename } from 'node:path';
import { Store, idField, textField, type User } from '../store.ts';
import { admin, allow, type AuthRequest } from '../common/auth.ts';

type Upload = {originalname: string; mimetype: string; buffer: Buffer; size: number};
const forumImageUpload = FileInterceptor('image', {limits: {fileSize: 5 * 1024 * 1024, files: 1, fields: 2}});

@ApiTags('Forum / Toplantı Notları')
@ApiBearerAuth('bearer')
@Controller('api/forums')
export class ForumsController {
  constructor(@Inject(Store) private store: Store) {}
  private async forum(id: number) {
    const row = (await this.store.db.query('SELECT id,name,description FROM forums WHERE id=$1', [id])).rows[0];
    if (!row) throw new NotFoundException('Forum bulunamadı.');
    return row;
  }
  private async access(user: User, id: number) {
    const forum = await this.forum(id);
    if (user.role !== 'admin' && !(await this.store.db.query(`SELECT 1 FROM forum_members WHERE "forumId"=$1 AND "userId"=$2 AND status='joined'`, [id, user.id])).rowCount) throw new ForbiddenException('Sohbet için forum üyeliğiniz onaylanmalı.');
    return forum;
  }
  @Get() async list(@Req() req: AuthRequest) {
    const user = allow(req, 'forum.view');
    return (await this.store.db.query(`SELECT f.id,f.name,f.description,f."createdAt",f."imageVersion",(f."imageContent" IS NOT NULL) AS "hasImage",m.status,
      (SELECT COUNT(*)::int FROM forum_members WHERE "forumId"=f.id AND status='joined') AS "memberCount",
      CASE WHEN $2 THEN (SELECT COUNT(*)::int FROM forum_members WHERE "forumId"=f.id AND status='pending') ELSE 0 END AS "requestCount"
      FROM forums f LEFT JOIN forum_members m ON m."forumId"=f.id AND m."userId"=$1 ORDER BY f.id DESC`, [user.id, user.role === 'admin'])).rows;
  }
  private image(file?: Upload) {
    if (!file) return null;
    const bytes = file.buffer;
    const mime = bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png'
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg'
      : ['GIF87a','GIF89a'].includes(bytes.subarray(0,6).toString()) ? 'image/gif'
      : bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP' ? 'image/webp' : null;
    if (!mime) throw new BadRequestException('Forum görseli JPG, PNG, GIF veya WebP olmalı.');
    return {content: bytes, mime};
  }
  @Get(':id/image') async imageFile(@Req() req: AuthRequest, @Param('id') raw: string, @Res() response: Response) {
    allow(req,'forum.view');
    const file = (await this.store.db.query('SELECT "imageContent","imageMimeType" FROM forums WHERE id=$1', [idField(raw)])).rows[0];
    if (!file?.imageContent) throw new NotFoundException('Forum görseli bulunamadı.');
    response.setHeader('X-Content-Type-Options','nosniff');
    response.type(file.imageMimeType).send(file.imageContent);
  }
  @Post()
  @UseInterceptors(forumImageUpload)
  async create(@Req() req: AuthRequest, @Body() body: Record<string, unknown>, @UploadedFile() file?: Upload) {
    const user = allow(req, 'forum.create');
    const name = textField(body.name, 'Forum adı', 100), description = this.description(body.description), image = this.image(file);
    return this.store.transaction(async client => {
      const forum = (await client.query('INSERT INTO forums(name,description,"createdBy","imageContent","imageMimeType","imageVersion") VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [name, description, user.id,image?.content ?? null,image?.mime ?? null,image ? 1 : 0])).rows[0];
      await client.query(`INSERT INTO forum_members VALUES($1,$2,'joined')`, [forum.id, user.id]);
      return forum;
    });
  }
  private description(value: unknown) {
    if (typeof value !== 'string' || value.length > 2000) throw new BadRequestException('Açıklama en fazla 2000 karakter olmalı.');
    return value.trim();
  }
  @Patch(':id')
  @UseInterceptors(forumImageUpload)
  async update(@Req() req: AuthRequest, @Param('id') raw: string, @Body() body: Record<string, unknown>, @UploadedFile() file?: Upload) {
    allow(req, 'forum.update'); const id = idField(raw); await this.forum(id);
    const image = this.image(file);
    await this.store.db.query(`UPDATE forums SET name=$1,description=$2,"imageContent"=COALESCE($4,"imageContent"),"imageMimeType"=COALESCE($5,"imageMimeType"),"imageVersion"="imageVersion"+CASE WHEN $4::bytea IS NULL THEN 0 ELSE 1 END WHERE id=$3`, [textField(body.name, 'Forum adı', 100), this.description(body.description), id,image?.content ?? null,image?.mime ?? null]);
    return {ok: true};
  }
  @Delete(':id') async remove(@Req() req: AuthRequest, @Param('id') raw: string) {
    allow(req, 'forum.delete');
    if (!(await this.store.db.query('DELETE FROM forums WHERE id=$1', [idField(raw)])).rowCount) throw new NotFoundException('Forum bulunamadı.');
    return {ok: true};
  }
  @Post(':id/join') async join(@Req() req: AuthRequest, @Param('id') raw: string) {
    const user = allow(req, 'forum.view'), id = idField(raw); await this.forum(id);
    await this.store.db.query(`INSERT INTO forum_members VALUES($1,$2,'pending') ON CONFLICT DO NOTHING`, [id, user.id]);
    return {ok: true};
  }
  @Get(':id/people') async people(@Req() req: AuthRequest, @Param('id') raw: string) {
    admin(req); await this.forum(idField(raw));
    return (await this.store.db.query(`SELECT u.id,u.name,u.surname,u.title,(u."avatarContent" IS NOT NULL) AS "hasAvatar",m.status
      FROM users u LEFT JOIN forum_members m ON m."userId"=u.id AND m."forumId"=$1 ORDER BY u.name,u.surname`, [idField(raw)])).rows;
  }
  @Post(':id/members/:userId') async add(@Req() req: AuthRequest, @Param('id') raw: string, @Param('userId') person: string) {
    admin(req); const id = idField(raw), userId = idField(person); await this.forum(id);
    if (!(await this.store.db.query('SELECT 1 FROM users WHERE id=$1', [userId])).rowCount) throw new NotFoundException('Kullanıcı bulunamadı.');
    await this.store.db.query(`INSERT INTO forum_members VALUES($1,$2,'joined') ON CONFLICT ("forumId","userId") DO UPDATE SET status='joined'`, [id,userId]);
    return {ok: true};
  }
  @Delete(':id/members/:userId') async reject(@Req() req: AuthRequest, @Param('id') raw: string, @Param('userId') person: string) {
    admin(req); await this.forum(idField(raw));
    await this.store.db.query('DELETE FROM forum_members WHERE "forumId"=$1 AND "userId"=$2', [idField(raw),idField(person)]);
    return {ok: true};
  }
  @Get('deliveries') async deliveries(@Req() req: AuthRequest) {
    const user = allow(req,'forum.view');
    return (await this.store.db.query(`SELECT m.id,m.body,m."forumId",m."authorId",m."createdAt",
      COALESCE((SELECT json_agg(json_build_object('id',f.id,'name',f.name,'mimeType',f."mimeType",'size',f.size)) FROM forum_files f WHERE f."messageId"=m.id),'[]') AS files
      FROM forum_message_receipts r
      JOIN forum_messages m ON m.id=r."messageId" JOIN forum_members fm ON fm."forumId"=m."forumId" AND fm."userId"=r."userId"
      WHERE r."userId"=$1 AND r."deliveredAt" IS NULL AND m."deletedAt" IS NULL AND fm.status='joined'
      AND NOT EXISTS(SELECT 1 FROM forum_message_hidden h WHERE h."messageId"=m.id AND h."userId"=$1)
      ORDER BY r."messageId" LIMIT 500`, [user.id])).rows;
  }
  @Post('receipts') async receipts(@Req() req: AuthRequest, @Body() body: Record<string,unknown>, @Res({passthrough: true}) response: Response) {
    const user = allow(req,'forum.view');
    if (!Array.isArray(body.ids) || body.ids.length > 500 || !['delivered','read'].includes(String(body.kind))) throw new BadRequestException('Geçersiz mesaj bilgisi.');
    const ids = [...new Set(body.ids.map(idField))], read = body.kind === 'read';
    const result = await this.store.db.query(`UPDATE forum_message_receipts r SET "deliveredAt"=COALESCE(r."deliveredAt",NOW()),
      "readAt"=CASE WHEN $3 THEN COALESCE(r."readAt",NOW()) ELSE r."readAt" END
      FROM forum_messages m, forum_members fm WHERE m.id=r."messageId" AND fm."forumId"=m."forumId" AND fm."userId"=$1 AND fm.status='joined'
      AND r."userId"=$1 AND r."messageId"=ANY($2::int[]) AND m."deletedAt" IS NULL
      AND (r."deliveredAt" IS NULL OR ($3 AND r."readAt" IS NULL))`, [user.id,ids,read]);
    response.locals.liveChanged = !!result.rowCount;
    return {ok: true};
  }
  @Get(':id/messages') async messages(@Req() req: AuthRequest, @Param('id') raw: string, @Query('before') before?: string) {
    const user = allow(req,'forum.view'), id = idField(raw); await this.access(user,id);
    return (await this.store.db.query(`SELECT m.id,CASE WHEN h."userId" IS NOT NULL THEN '' ELSE m.body END AS body,m."createdAt",m."authorId",m."editedAt",m."deletedAt",(h."userId" IS NOT NULL) AS hidden,
      COALESCE(u.name,'Silinmiş kullanıcı') AS name,COALESCE(u.surname,'') AS surname,(u."avatarContent" IS NOT NULL) AS "hasAvatar",
      CASE WHEN h."userId" IS NOT NULL THEN '[]'::json ELSE COALESCE((SELECT json_agg(json_build_object('id',f.id,'name',f.name,'mimeType',f."mimeType",'size',f.size) ORDER BY f.id) FROM forum_files f WHERE f."messageId"=m.id),'[]') END AS files,
      (SELECT r."readAt" FROM forum_message_receipts r WHERE r."messageId"=m.id AND r."userId"=$3) AS "myReadAt",
      EXISTS(SELECT 1 FROM forum_message_receipts r WHERE r."messageId"=m.id AND r."userId"=$3) AS "isRecipient",
      CASE WHEN m."authorId"=$3 THEN (SELECT json_build_object('total',COUNT(*),'delivered',COUNT("deliveredAt"),'read',COUNT("readAt")) FROM forum_message_receipts r WHERE r."messageId"=m.id) ELSE NULL END AS receipts
      FROM forum_messages m LEFT JOIN users u ON u.id=m."authorId"
      LEFT JOIN forum_message_hidden h ON h."messageId"=m.id AND h."userId"=$3
      WHERE m."forumId"=$1 AND ($2::int IS NULL OR m.id<$2) ORDER BY m.id DESC LIMIT 50`, [id, before ? idField(before) : null,user.id])).rows.reverse();
  }
  @Post(':id/messages')
  @UseInterceptors(FilesInterceptor('files', 5, {limits: {fileSize: 10 * 1024 * 1024, files: 5, fields: 1, fieldSize: 20000}}))
  async send(@Req() req: AuthRequest, @Param('id') raw: string, @Body() body: Record<string, unknown>, @UploadedFiles() files: {originalname: string; mimetype: string; buffer: Buffer; size: number}[] = []) {
    const user = allow(req,'forum.view'), id = idField(raw); await this.access(user,id);
    if (typeof body.body !== 'string' || body.body.trim().length > 5000 || (!body.body.trim() && !files.length)) throw new BadRequestException('Mesaj yazın veya dosya seçin (en fazla 5000 karakter).');
    const messageBody = body.body.trim();
    const uploads = files.map(file => {
      if (!file.buffer.length) throw new BadRequestException('Boş dosya gönderilemez.');
      return {...file, originalname: textField(basename(file.originalname).replaceAll('\0',''), 'Dosya adı',255)};
    });
    return this.store.transaction(async client => {
      const message = (await client.query('INSERT INTO forum_messages("forumId","authorId",body,"receiptsInitialized") VALUES($1,$2,$3,TRUE) RETURNING id', [id,user.id,messageBody])).rows[0];
      for (const file of uploads) await client.query('INSERT INTO forum_files("messageId",name,"mimeType",size,content) VALUES($1,$2,$3,$4,$5)', [message.id,file.originalname,file.mimetype,file.size,file.buffer]);
      await client.query(`INSERT INTO forum_message_receipts ("messageId","userId") SELECT $1,"userId" FROM forum_members WHERE "forumId"=$2 AND status='joined' AND "userId"<>$3`, [message.id,id,user.id]);
      return message;
    });
  }
  @Get(':id/files/:fileId') async file(@Req() req: AuthRequest, @Param('id') raw: string, @Param('fileId') fileId: string, @Res() response: Response) {
    const user = allow(req,'forum.view'), id = idField(raw); await this.access(user,id);
    const file = (await this.store.db.query(`SELECT f.* FROM forum_files f JOIN forum_messages m ON m.id=f."messageId" WHERE f.id=$1 AND m."forumId"=$2 AND m."deletedAt" IS NULL AND NOT EXISTS(SELECT 1 FROM forum_message_hidden h WHERE h."messageId"=m.id AND h."userId"=$3)`, [idField(fileId),id,user.id])).rows[0];
    if (!file) throw new NotFoundException('Dosya bulunamadı.');
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('X-Content-Type-Options','nosniff');
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    response.send(file.content);
  }
  @Patch(':id/messages/:messageId') async editMessage(@Req() req: AuthRequest, @Param('id') raw: string, @Param('messageId') rawMessage: string, @Body() body: Record<string,unknown>) {
    const user = allow(req,'forum.view'), id = idField(raw); await this.access(user,id);
    const result = await this.store.db.query(`UPDATE forum_messages SET body=$1,"editedAt"=NOW() WHERE id=$2 AND "forumId"=$3 AND "authorId"=$4 AND "deletedAt" IS NULL RETURNING id`, [textField(body.body,'Mesaj',5000),idField(rawMessage),id,user.id]);
    if (!result.rowCount) throw new ForbiddenException('Yalnızca kendi silinmemiş mesajınızı düzenleyebilirsiniz.');
    return {ok:true};
  }
  @Delete(':id/messages/:messageId') async deleteMessage(@Req() req: AuthRequest, @Param('id') raw: string, @Param('messageId') rawMessage: string, @Query('scope') scope: string) {
    const user = allow(req,'forum.view'), id = idField(raw), messageId = idField(rawMessage); await this.access(user,id);
    if (!['me','everyone'].includes(scope)) throw new BadRequestException('Silme kapsamını seçin.');
    await this.store.transaction(async client => {
      const message = (await client.query('SELECT "authorId" FROM forum_messages WHERE id=$1 AND "forumId"=$2 FOR UPDATE', [messageId,id])).rows[0];
      if (!message) throw new NotFoundException('Mesaj bulunamadı.');
      if (scope === 'me') {await client.query('INSERT INTO forum_message_hidden VALUES($1,$2) ON CONFLICT DO NOTHING', [messageId,user.id]); return;}
      if (message.authorId !== user.id) throw new ForbiddenException('Yalnızca kendi mesajınızı herkesten silebilirsiniz.');
      await client.query('UPDATE forum_messages SET body=$1,"deletedAt"=COALESCE("deletedAt",NOW()) WHERE id=$2', ['',messageId]);
      await client.query('DELETE FROM forum_files WHERE "messageId"=$1', [messageId]);
    });
    return {ok:true};
  }
  @Get(':id/messages/:messageId/receipts') async messageReceipts(@Req() req: AuthRequest, @Param('id') raw: string, @Param('messageId') rawMessage: string) {
    const user = allow(req,'forum.view'), id = idField(raw), messageId = idField(rawMessage); await this.access(user,id);
    if (!(await this.store.db.query('SELECT 1 FROM forum_messages WHERE id=$1 AND "forumId"=$2 AND "authorId"=$3', [messageId,id,user.id])).rowCount) throw new ForbiddenException('Yalnızca kendi mesajınızın bilgisini görebilirsiniz.');
    return (await this.store.db.query(`SELECT u.id,u.name,u.surname,(u."avatarContent" IS NOT NULL) AS "hasAvatar",r."deliveredAt",r."readAt" FROM forum_message_receipts r JOIN users u ON u.id=r."userId" WHERE r."messageId"=$1 ORDER BY u.name,u.surname`, [messageId])).rows;
  }
}
@Module({controllers: [ForumsController]}) export class ForumsModule {}
