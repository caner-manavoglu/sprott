import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { allow } from '../common/auth.ts';
import { MANAGED_GROUPS, hash, type User } from '../common/fields.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { query } from '../prisma/sql.ts';
import { type CreateUserDto, type UpdateProfileDto, type UpdateUserDto } from './dto/users.dto.ts';

const COLUMNS = `u.id,u.name,u.surname,u.title,u.email,u.role,u.permissions,(u."avatarContent" IS NOT NULL) AS "hasAvatar", ${MANAGED_GROUPS} AS "managedGroups"`;
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

@Injectable()
export class UsersService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) { }
  private list(search?: string) {
    const term = search?.trim() ?? '';
    if (!term) return query(this.prisma, `SELECT ${COLUMNS} FROM users u ORDER BY u.id`);
    const pattern = `%${term.replace(/[\\%_]/g, character => `\\${character}`)}%`;
    return query(this.prisma,
      `SELECT ${COLUMNS} FROM users u
       WHERE u.name ILIKE $1 OR u.surname ILIKE $1 OR u.email ILIKE $1 OR (u.name || ' ' || u.surname) ILIKE $1
       ORDER BY u.id`,
      [pattern]);
  }
  private async guard<T>(action: () => Promise<T>) {
    try { return await action(); } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new BadRequestException('Bu e-posta adresi zaten kayıtlı.');
      throw error;
    }
  }
  index(user: User, search?: string) { allow(user, 'user.view'); return this.list(search); }
  async avatar(id: number, response: Response) {
    const avatar = await this.prisma.user.findUnique({ where: { id }, select: { avatarMimeType: true, avatarContent: true } });
    if (!avatar?.avatarContent) throw new NotFoundException('Profil fotoğrafı bulunamadı.');
    response.type(avatar.avatarMimeType || 'application/octet-stream').send(Buffer.from(avatar.avatarContent));
  }
  async me(user: User, body: UpdateProfileDto, file?: { mimetype: string; buffer: Buffer }) {
    if (file && !AVATAR_TYPES.includes(file.mimetype)) throw new BadRequestException('Fotoğraf JPG, PNG, WebP veya GIF olmalı.');
    await this.guard(() => this.prisma.user.update({
      where: { id: user.id }, data: {
        email: body.email, ...(body.password ? { password: hash(body.password) } : {}),
        ...(body.removeAvatar ? { avatarMimeType: null, avatarContent: null } : file ? { avatarMimeType: file.mimetype, avatarContent: new Uint8Array(file.buffer) } : {}),
      },
    }));
    return (await query(this.prisma, `SELECT ${COLUMNS} FROM users u WHERE id=$1`, [user.id]))[0];
  }
  async create(user: User, body: CreateUserDto) {
    allow(user, 'user.create');
    await this.guard(() => this.prisma.user.create({
      data: {
        name: body.name, surname: body.surname, title: body.title, email: body.email, password: hash(body.password), role: 'user',
        permissions: { 'task.view': true, 'pr.view': true, 'pr.create': true, 'pr.update': true, 'pr.delete': true, 'pr.merge': true },
      },
    }));
    return this.list();
  }
  async edit(user: User, id: number, body: UpdateUserDto) {
    allow(user, 'user.update');
    // Şifre yalnızca gönderildiğinde değişir; boş bırakmak mevcut şifreyi korur.
    const result = await this.guard(() => this.prisma.user.updateMany({
      where: { id }, data: {
        name: body.name, surname: body.surname, title: body.title, email: body.email,
        ...(body.password ? { password: hash(body.password) } : {}),
      },
    }));
    if (!result.count) throw new NotFoundException('Kullanıcı bulunamadı.');
    return this.list();
  }
  async remove(actor: User, id: number) {
    allow(actor, 'user.delete');
    if (id === actor.id) throw new BadRequestException('Kendi hesabınızı silemezsiniz.');
    await this.prisma.$transaction(async client => {
      const target = await client.user.findUnique({ where: { id }, select: { role: true } });
      if (!target) throw new NotFoundException('Kullanıcı bulunamadı.');
      if (target.role === 'admin') throw new BadRequestException('Yönetici hesabı silinemez.');
      if (await client.task.count({ where: { createdBy: id } })) throw new BadRequestException('Bu kullanıcının task’ları var; önce task’ları silin.');
      await client.session.deleteMany({ where: { userId: id } });
      await client.user.deleteMany({ where: { id } });
    });
    return this.list();
  }
}
