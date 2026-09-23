import { createParamDecorator, ForbiddenException, UnauthorizedException, type ExecutionContext, type PipeTransform } from '@nestjs/common';
import type { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { can, idField, type Permission, type User } from '../common/fields.ts';

export type AuthRequest = Request & { user?: User };
/** Oturum anahtarları veritabanında yalnızca özet olarak tutulur. */
export const digest = (token: string) => createHash('sha256').update(token).digest('hex');

/** Tarayıcı oturumu: JavaScript'in okuyamadığı, yalnızca aynı siteden gönderilen çerez. */
export const SESSION_COOKIE = 'sprott_session';
export function setSessionCookie(res: Response, value: string, maxAge: number) {
  res.cookie(SESSION_COOKIE, value, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/api', maxAge });
}
export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/api' });
}
function cookie(req: Request, name: string) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return '';
}
/** Yalnızca `Authorization: Bearer` başlığı; MCP ve Swagger istemcileri bunu kullanır. */
export const bearer = (req: Request) => {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? digest(header.slice(7).trim()) : '';
};
/** Oturum anahtarının özeti: önce bearer başlığı, yoksa oturum çerezi. */
export const token = (req: Request) => {
  if (req.headers.authorization) return bearer(req);
  const value = cookie(req, SESSION_COOKIE);
  return value ? digest(value) : '';
};

export function current(req: AuthRequest) { if (!req.user) throw new UnauthorizedException('Lütfen giriş yapın.'); return req.user; }
/** Oturumdaki kullanıcı; oturum yoksa 401. Servisler Express isteği yerine bu kullanıcıyı alır. */
export const CurrentUser = createParamDecorator((_: unknown, context: ExecutionContext) => current(context.switchToHttp().getRequest()));
/** Rota kimlikleri: `@Param('id', ParseId)` pozitif int32 döndürür, aksi halde 400. */
export const ParseId: PipeTransform<unknown, number> = { transform: value => idField(value) };

export function admin(user: User) { if (user.role !== 'admin') throw new ForbiddenException('Bu işlem için yönetici yetkisi gerekli.'); return user; }
export const permissionLabels: Record<Permission, string> = {
  'forum.view': 'Forum görüntüleme ve katılma', 'forum.create': 'Forum oluşturma', 'forum.update': 'Forum güncelleme', 'forum.delete': 'Forum silme',
  'project.view': 'Proje görüntüleme', 'project.create': 'Proje oluşturma', 'project.update': 'Proje düzenleme', 'project.delete': 'Proje silme',
  'task.view': 'Task görüntüleme', 'task.create': 'Task oluşturma', 'task.update': 'Task güncelleme', 'task.delete': 'Task silme',
  'user.view': 'Kullanıcı görüntüleme', 'user.create': 'Kullanıcı oluşturma', 'user.update': 'Kullanıcı güncelleme', 'user.delete': 'Kullanıcı silme',
  'group.view': 'Grup görüntüleme', 'group.create': 'Grup oluşturma', 'group.update': 'Grup güncelleme', 'group.delete': 'Grup silme',
  'report.view.all': 'Tüm raporları görüntüleme', 'report.view.group': 'Grubumun raporunu görüntüleme',
  'log.view': 'Log görüntüleme',
  'announcement.create': 'Duyuru oluşturma',
  'pr.view': 'PR görüntüleme', 'pr.create': 'PR ekleme', 'pr.update': 'PR düzenleme',
  'pr.delete': 'PR silme', 'pr.merge': 'PR’ı onaylandı işaretleme',
  'workflow.view': 'Akış kurallarını görüntüleme', 'workflow.create': 'Akış kuralı tanımlama',
  'workflow.update': 'Akış kuralı düzenleme', 'workflow.delete': 'Akış kuralını kaldırma',
};
/**
 * Yetki kontrolü serviste kalır: aynı servisler MCP gibi HTTP dışı yollardan da çağrılabilir
 * ve bazı kurallar (ör. akışta create/update) veriye bakmadan bilinemez.
 */
export function allow(user: User, permission: Permission) {
  if (!can(user, permission)) throw new ForbiddenException(`${permissionLabels[permission]} yetkiniz bulunmuyor.`);
  return user;
}
