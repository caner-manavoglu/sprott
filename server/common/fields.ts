import type { User as UserModel } from '../generated/prisma/client.ts';
import { BadRequestException } from '@nestjs/common';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { APP_TIMEZONE, monthAgo } from '../../shared/timezone.ts';

// Yetkiler JSONB olarak tutulur; yeni modül yetkisi eklemek için buraya bir anahtar eklemek yeterlidir.
export const PERMISSIONS = [
  'forum.view', 'forum.create', 'forum.update', 'forum.delete',
  'task.view', 'task.create', 'task.update', 'task.delete',
  'user.view', 'user.create', 'user.update', 'user.delete',
  'group.view', 'group.create', 'group.update', 'group.delete',
  'project.view', 'project.create', 'project.update', 'project.delete',
  'report.view.all', 'report.view.group',
  'workflow.view', 'workflow.create', 'workflow.update', 'workflow.delete',
  'pr.view', 'pr.create', 'pr.update', 'pr.delete', 'pr.merge',
  'log.view',
  'announcement.create',
] as const;
export type Permission = typeof PERMISSIONS[number];
export type User = Pick<UserModel, 'id' | 'name' | 'surname' | 'title' | 'email'> & { role: 'admin' | 'user'; permissions: Partial<Record<Permission, boolean>>; hasAvatar?: boolean; managedGroups?: string[] };
// Yöneticiler her yetkiye sahiptir; personelin yetkisi kaydedilmiş olmalıdır.
export const can = (user: User, permission: Permission) => user.role === 'admin' || user.permissions?.[permission] === true;
export function hash(password: string) { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`; }
export function matches(password: string, saved: string) {
  const [salt, key] = saved.split(':');
  // Bozuk veya eski biçimli kayıt girişi çökertmez, yalnızca eşleşmez.
  if (!salt || !key || key.length !== 128) return false;
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(key, 'hex'));
}
export function textField(value: unknown, label: string, max: number) { if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new BadRequestException(`${label} 1–${max} karakter olmalı.`); return value.trim(); }
/**
 * Uygulama saat dilimindeki bugünün tarihi. SQL tarafında `TODAY` ile aynı günü verir;
 * ikisi de `CURRENT_DATE`/sunucu yereli yerine `APP_TIMEZONE` üzerinden hesaplanır.
 */
export { isoDate, monthAgo } from '../../shared/timezone.ts';
/** Tarih karşılaştırmalarının SQL karşılığı; `CURRENT_DATE` sunucunun saat dilimine bağlıdır. */
export const TODAY = `(now() AT TIME ZONE '${APP_TIMEZONE}')::date`;
/**
 * Task tarihleri: başlangıç bugünden en fazla bir ay geriye alınabilir, bitişte üst sınır yoktur.
 * `enforceStartLimit` yalnızca başlangıç bu istekte gönderildiğinde geçerlidir; eski task'ların
 * bitişi güncellenirken geçmiş başlangıç tarihi hata vermez.
 */
export function taskDates(startDate: string | null, dueDate: string | null, enforceStartLimit = true) {
  if (startDate && enforceStartLimit && startDate < monthAgo()) throw new BadRequestException('Başlangıç tarihi bugünden en fazla bir ay öncesi olabilir.');
  if (startDate && dueDate && dueDate < startDate) throw new BadRequestException('Bitiş tarihi başlangıç tarihinden önce olamaz.');
  return { startDate, dueDate };
}
/**
 * Kişinin yönettiği grupların adları. Kaynak `group_managers` tablosudur;
 * gruptan yönetici eklenip çıkarıldıkça listeler kendiliğinden güncellenir.
 */
export const MANAGED_GROUPS = `COALESCE((SELECT json_agg(g.name ORDER BY g.name) FROM group_managers m JOIN groups g ON g.id=m."groupId" WHERE m."userId"=u.id), '[]')`;
export function idField(value: unknown) { const id = Number(value); if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647) throw new BadRequestException('Geçersiz kayıt.'); return id; }
