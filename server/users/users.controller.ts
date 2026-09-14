import { BadRequestException, Body, Controller, Delete, Get, Inject, NotFoundException, Param, Patch, Post, Query, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { MANAGED_GROUPS, Store, emailField, hash, idField, passwordField, textField } from '../store.ts';
import { type AuthRequest, allow, current } from '../common/auth.ts';
import { usersSchema } from '../common/schemas.ts';
import { editUserSchema, newUserSchema } from './users.schemas.ts';

@ApiTags('Kullanıcılar')
@ApiBearerAuth('bearer')
@ApiResponse({status: 401, description: 'Oturum gerekli.'})
@ApiResponse({status: 403, description: 'Yetki reddedildi.'})
@Controller('api/users')
export class UsersController {
  constructor(@Inject(Store) private store: Store) {}
  // ILIKE büyük/küçük harf duyarsızdır; ad, soyad, tam ad ve e-posta üzerinde arar.
  // `managedGroups` gruplardan türediği için grup yöneticisi etiketi listeyle birlikte tazelenir.
  private async list(search?: unknown) {
    const columns = `u.id,u.name,u.surname,u.title,u.email,u.role,u.permissions,(u."avatarContent" IS NOT NULL) AS "hasAvatar", ${MANAGED_GROUPS} AS "managedGroups"`;
    const term = typeof search === 'string' ? search.trim() : '';
    if (!term) return (await this.store.db.query(`SELECT ${columns} FROM users u ORDER BY u.id`)).rows;
    const pattern = `%${term.replace(/[\\%_]/g, character => `\\${character}`)}%`;
    return (await this.store.db.query(
      `SELECT ${columns} FROM users u
       WHERE u.name ILIKE $1 OR u.surname ILIKE $1 OR u.email ILIKE $1 OR (u.name || ' ' || u.surname) ILIKE $1
       ORDER BY u.id`,
      [pattern],
    )).rows;
  }
  // Aynı e-posta ikinci kez kaydedilemez; benzersizlik kısıtı hatası kullanıcıya açık mesaja çevrilir.
  private async guard<T>(action: () => Promise<T>) {
    try { return await action(); } catch (error) {
      if ((error as {code?: string}).code === '23505') throw new BadRequestException('Bu e-posta adresi zaten kayıtlı.');
      throw error;
    }
  }
  private profile(body: Record<string, unknown>) {
    return {
      name: textField(body.name, 'Ad', 60), surname: textField(body.surname, 'Soyad', 60),
      title: textField(body.title, 'Ünvan', 80), email: emailField(body.email),
    };
  }
  @ApiOperation({summary: 'Kullanıcıları listele (user.view yetkisi)'})
  @ApiResponse({status: 200, schema: usersSchema})
  @ApiQuery({name: 'search', required: false, description: 'Ad, soyad veya e-postada büyük/küçük harf duyarsız arama.', example: 'caner'})
  @Get() index(@Req() req: AuthRequest, @Query('search') search?: string) { allow(req, 'user.view'); return this.list(search); }
  @Get(':id/avatar') async avatar(@Param('id') rawId: string, @Res() response: Response) {
    const avatar = (await this.store.db.query('SELECT "avatarMimeType","avatarContent" FROM users WHERE id=$1', [idField(rawId)])).rows[0];
    if (!avatar?.avatarContent) throw new NotFoundException('Profil fotoğrafı bulunamadı.');
    response.type(avatar.avatarMimeType).send(avatar.avatarContent);
  }
  @ApiOperation({summary: 'Kendi e-posta, şifre ve profil fotoğrafını güncelle'})
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('avatar', {limits: {fileSize: 5 * 1024 * 1024}}))
  @Patch('me') async me(@Req() req: AuthRequest, @Body() body: Record<string, unknown>, @UploadedFile() file?: {mimetype: string; buffer: Buffer}) {
    const user = current(req), email = emailField(body.email);
    const password = body.password === undefined || body.password === '' ? null : hash(passwordField(body.password));
    const removeAvatar = body.removeAvatar === 'true';
    if (body.removeAvatar !== undefined && !['true', 'false'].includes(String(body.removeAvatar))) throw new BadRequestException('Fotoğraf kaldırma değeri geçersiz.');
    if (file && !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)) throw new BadRequestException('Fotoğraf JPG, PNG, WebP veya GIF olmalı.');
    await this.guard(() => this.store.db.query(
      `UPDATE users SET email=$1,password=COALESCE($2,password),
        "avatarMimeType"=CASE WHEN $3 THEN NULL ELSE COALESCE($4,"avatarMimeType") END,
        "avatarContent"=CASE WHEN $3 THEN NULL ELSE COALESCE($5,"avatarContent") END WHERE id=$6`,
      [email, password, removeAvatar, file?.mimetype ?? null, file?.buffer ?? null, user.id],
    ));
    return (await this.store.db.query(`SELECT u.id,u.name,u.surname,u.title,u.email,u.role,u.permissions,(u."avatarContent" IS NOT NULL) AS "hasAvatar", ${MANAGED_GROUPS} AS "managedGroups" FROM users u WHERE id=$1`, [user.id])).rows[0];
  }
  @ApiOperation({summary: 'Kullanıcı oluştur (user.create yetkisi)'})
  @ApiBody({schema: newUserSchema})
  @ApiResponse({status: 400, description: 'Geçersiz istek.'})
  @ApiResponse({status: 201, schema: usersSchema})
  @Post() async create(@Req() req: AuthRequest, @Body() body: Record<string, unknown>) {
    allow(req, 'user.create');
    const {name, surname, title, email} = this.profile(body), password = passwordField(body.password);
    await this.guard(() => this.store.db.query(
      'INSERT INTO users(name,surname,title,email,password,role,permissions) VALUES($1,$2,$3,$4,$5,$6,$7)',
      // PR yetkileri varsayılan olarak açıktır; yetkiler ekranından kısılabilir.
      [name, surname, title, email, hash(password), 'user',
        {'task.view': true, 'pr.view': true, 'pr.create': true, 'pr.update': true, 'pr.delete': true, 'pr.merge': true}],
    ));
    return this.list();
  }
  @ApiOperation({summary: 'Kullanıcıyı güncelle (user.update yetkisi)'})
  @ApiParam({name: 'id', type: Number, example: 2})
  @ApiBody({schema: editUserSchema})
  @ApiResponse({status: 400, description: 'Geçersiz istek.'})
  @ApiResponse({status: 404, description: 'Kayıt bulunamadı.'})
  @ApiResponse({status: 200, schema: usersSchema})
  @Patch(':id') async edit(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    allow(req, 'user.update');
    const {name, surname, title, email} = this.profile(body);
    // Şifre yalnızca gönderildiğinde değişir; boş bırakmak mevcut şifreyi korur.
    const password = body.password === undefined || body.password === '' ? null : hash(passwordField(body.password));
    const result = await this.guard(() => this.store.db.query(
      'UPDATE users SET name=$1,surname=$2,title=$3,email=$4,password=COALESCE($5,password) WHERE id=$6',
      [name, surname, title, email, password, idField(id)],
    ));
    if (!result.rowCount) throw new NotFoundException('Kullanıcı bulunamadı.');
    return this.list();
  }
  @ApiOperation({summary: 'Kullanıcıyı sil (user.delete yetkisi)'})
  @ApiParam({name: 'id', type: Number, example: 2})
  @ApiResponse({status: 400, description: 'Geçersiz istek.'})
  @ApiResponse({status: 404, description: 'Kayıt bulunamadı.'})
  @ApiResponse({status: 200, schema: usersSchema})
  @Delete(':id') async remove(@Req() req: AuthRequest, @Param('id') rawId: string) {
    const actor = allow(req, 'user.delete'), id = idField(rawId);
    if (id === actor.id) throw new BadRequestException('Kendi hesabınızı silemezsiniz.');
    await this.store.transaction(async client => {
      const target = (await client.query('SELECT role FROM users WHERE id=$1', [id])).rows[0] as {role: string} | undefined;
      if (!target) throw new NotFoundException('Kullanıcı bulunamadı.');
      if (target.role === 'admin') throw new BadRequestException('Yönetici hesabı silinemez.');
      if ((await client.query('SELECT id FROM tasks WHERE "createdBy"=$1 LIMIT 1', [id])).rowCount) throw new BadRequestException('Bu kullanıcının task’ları var; önce task’ları silin.');
      await client.query('DELETE FROM sessions WHERE "userId"=$1', [id]);
      await client.query('DELETE FROM users WHERE id=$1', [id]);
    });
    return this.list();
  }
}
