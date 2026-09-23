import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { allow, current, type AuthRequest } from '../common/auth.ts';
import { MANAGED_GROUPS, emailField, hash, idField, passwordField, textField } from '../common/fields.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { sql } from '../prisma/sql.ts';
import { WorkspaceService } from '../workspace/workspace.service.ts';
import { type CreateUserDto, type UpdateProfileDto, type UpdateUserDto } from './dto/users.dto.ts';

@Injectable()
export class UsersService {
  constructor(@Inject(WorkspaceService) private workspace: WorkspaceService, @Inject(PrismaService) private prisma: PrismaService) { }
  private async list(search?: unknown) {
    const columns = `u.id,u.name,u.surname,u.title,u.email,u.role,u.permissions,(u."avatarContent" IS NOT NULL) AS "hasAvatar", ${MANAGED_GROUPS} AS "managedGroups"`;
    const term = typeof search === 'string' ? search.trim() : '';
    if (!term) return (await sql(this.prisma, `SELECT ${columns} FROM users u ORDER BY u.id`)).rows;
    const pattern = `%${term.replace(/[\\%_]/g, character => `\\${character}`)}%`;
    return (await sql(this.prisma,
      `SELECT ${columns} FROM users u
       WHERE u.name ILIKE $1 OR u.surname ILIKE $1 OR u.email ILIKE $1 OR (u.name || ' ' || u.surname) ILIKE $1
       ORDER BY u.id`,
      [pattern],
    )).rows;
  }
  private async guard<T>(action: () => Promise<T>) {
    try { return await action(); } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new BadRequestException('Bu e-posta adresi zaten kayıtlı.');
      throw error;
    }
  }
  private profile(body: Record<string, unknown>) {
    return {
      name: textField(body.name, 'Ad', 60), surname: textField(body.surname, 'Soyad', 60),
      title: textField(body.title, 'Ünvan', 80), email: emailField(body.email),
    };
  }
  index(req: AuthRequest, search?: string) { allow(req, 'user.view'); return this.list(search); }
  async avatar(rawId: string, response: Response) {
    const avatar = (await this.prisma.user.findFirst({ where: { id: idField(rawId) }, select: { avatarMimeType: true, avatarContent: true }, }));
    if (!avatar?.avatarContent) throw new NotFoundException('Profil fotoğrafı bulunamadı.');
    response.type(avatar.avatarMimeType || 'application/octet-stream').send(Buffer.from(avatar.avatarContent));
  }
  async me(req: AuthRequest, body: UpdateProfileDto, file?: { mimetype: string; buffer: Buffer }) {
    const user = current(req), email = emailField(body.email);
    const password = body.password === undefined || body.password === '' ? null : hash(passwordField(body.password));
    const removeAvatar = body.removeAvatar === 'true';
    if (body.removeAvatar !== undefined && !['true', 'false'].includes(String(body.removeAvatar))) throw new BadRequestException('Fotoğraf kaldırma değeri geçersiz.');
    if (file && !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)) throw new BadRequestException('Fotoğraf JPG, PNG, WebP veya GIF olmalı.');
    await this.guard(() => this.prisma.user.update({
      where: { id: user.id }, data: {
        email, ...(password === null ? {} : { password }),
        ...(removeAvatar ? { avatarMimeType: null, avatarContent: null } : file ? { avatarMimeType: file.mimetype, avatarContent: new Uint8Array(file.buffer) } : {}),
      }
    }));
    return (await sql(this.prisma, `SELECT u.id,u.name,u.surname,u.title,u.email,u.role,u.permissions,(u."avatarContent" IS NOT NULL) AS "hasAvatar", ${MANAGED_GROUPS} AS "managedGroups" FROM users u WHERE id=$1`, [user.id])).rows[0];
  }
  async create(req: AuthRequest, body: CreateUserDto) {
    allow(req, 'user.create');
    const { name, surname, title, email } = this.profile(body), password = passwordField(body.password);
    await this.guard(() => this.prisma.user.create({
      data: {
        name, surname, title, email, password: hash(password), role: 'user',
        permissions: { 'task.view': true, 'pr.view': true, 'pr.create': true, 'pr.update': true, 'pr.delete': true, 'pr.merge': true },
      }
    }));
    return this.list();
  }
  async edit(req: AuthRequest, id: string, body: UpdateUserDto) {
    allow(req, 'user.update');
    const { name, surname, title, email } = this.profile(body);
    // Şifre yalnızca gönderildiğinde değişir; boş bırakmak mevcut şifreyi korur.
    const password = body.password === undefined || body.password === '' ? null : hash(passwordField(body.password));
    const result = await this.guard(() => this.prisma.user.updateMany({
      where: { id: idField(id) }, data: {
        name, surname, title, email, ...(password === null ? {} : { password }),
      }
    }));
    if (!result.count) throw new NotFoundException('Kullanıcı bulunamadı.');
    return this.list();
  }
  async remove(req: AuthRequest, rawId: string) {
    const actor = allow(req, 'user.delete'), id = idField(rawId);
    if (id === actor.id) throw new BadRequestException('Kendi hesabınızı silemezsiniz.');
    await this.workspace.transaction(async client => {
      const target = (await client.user.findFirst({ where: { id }, select: { role: true }, })) as { role: string } | undefined;
      if (!target) throw new NotFoundException('Kullanıcı bulunamadı.');
      if (target.role === 'admin') throw new BadRequestException('Yönetici hesabı silinemez.');
      if ((await client.task.count({ where: { createdBy: id }, }))) throw new BadRequestException('Bu kullanıcının task’ları var; önce task’ları silin.');
      await client.session.deleteMany({ where: { userId: id }, });
      await client.user.deleteMany({ where: { id }, });
    });
    return this.list();
  }
}
