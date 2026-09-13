import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import { can, type Permission, type User } from '../store.ts';

export type AuthRequest = Request & { user?: User };
/** Oturum anahtarları veritabanında yalnızca özet olarak tutulur. */
export const digest = (token: string) => createHash('sha256').update(token).digest('hex');
export const token = (req: Request) => {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? digest(header.slice(7).trim()) : '';
};
export function current(req: AuthRequest) { if (!req.user) throw new UnauthorizedException('Lütfen giriş yapın.'); return req.user; }
export function admin(req: AuthRequest) { if (current(req).role !== 'admin') throw new ForbiddenException('Bu işlem için yönetici yetkisi gerekli.'); }
export const permissionLabels: Record<Permission, string> = {
  'project.view': 'Proje görüntüleme', 'project.create': 'Proje oluşturma', 'project.update': 'Proje düzenleme', 'project.delete': 'Proje silme',
  'task.view': 'Task görüntüleme', 'task.create': 'Task oluşturma', 'task.update': 'Task güncelleme', 'task.delete': 'Task silme',
  'user.view': 'Kullanıcı görüntüleme', 'user.create': 'Kullanıcı oluşturma', 'user.update': 'Kullanıcı güncelleme', 'user.delete': 'Kullanıcı silme',
  'group.view': 'Grup görüntüleme', 'group.create': 'Grup oluşturma', 'group.update': 'Grup güncelleme', 'group.delete': 'Grup silme',
  'report.view.all': 'Tüm raporları görüntüleme', 'report.view.group': 'Grubumun raporunu görüntüleme',
  'log.view': 'Log görüntüleme',
  'announcement.create': 'Duyuru oluşturma',
  'workflow.view': 'Akış kurallarını görüntüleme', 'workflow.create': 'Akış kuralı tanımlama',
  'workflow.update': 'Akış kuralı düzenleme', 'workflow.delete': 'Akış kuralını kaldırma',
};
export function allow(req: AuthRequest, permission: Permission) {
  const user = current(req);
  if (!can(user, permission)) throw new ForbiddenException(`${permissionLabels[permission]} yetkiniz bulunmuyor.`);
  return user;
}
