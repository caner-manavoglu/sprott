import { z } from 'zod';

// İstek gövdeleri burada bir kez doğrulanır ve servislerin kullanacağı tiplere dönüştürülür:
// kimlikler number, boş form alanları null, multipart metinleri boolean/dizi olur.

/** Pozitif int32; JSON'dan number, multipart formdan rakam dizisi olarak gelebilir. */
export const identifier = z.union([z.number(), z.string().regex(/^\d+$/).transform(Number)])
  .pipe(z.number().int().positive().max(2147483647));
export const text = (max: number) => z.string().trim().min(1).max(max);
/** Boş bırakılabilen metin; gönderilmezse `undefined` kalır. */
export const optionalText = (max: number) => z.string().trim().max(max).optional();
export const email = text(254).toLowerCase().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Geçerli bir e-posta adresi girin.');
export const password = z.string().min(8, 'Şifre 8–256 karakter olmalı.').max(256, 'Şifre 8–256 karakter olmalı.');
/** Düzenlemede boş şifre "değiştirme" demektir; `undefined` döner. */
export const optionalPassword = z.union([password, z.literal('').transform(() => undefined)]).optional();

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG biçiminde olmalı.')
  .refine(value => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
  }, 'Geçerli bir tarih olmalı.');
/** 'YYYY-MM-DD'; boş dize tarihin kaldırılmasıdır (`null`). */
export const date = z.union([calendarDate, z.literal('').transform(() => null)]).nullable().optional();
/** Boş dize veya null "seçim yok" demektir. */
export const optionalId = z.union([identifier, z.literal('').transform(() => null)]).nullable().optional();
/** JSON'da boolean, multipart formda 'true' / 'false'. */
export const formBoolean = z.union([z.boolean(), z.enum(['true', 'false']).transform(value => value === 'true')]).optional();
/** JSON'da dizi, multipart formda JSON dizisi metni; tekrarlar ayıklanır, yoksa boş dizi. */
export const formIds = z.preprocess(value => {
  if (typeof value !== 'string') return value;
  if (!value.trim()) return [];
  try { return JSON.parse(value); } catch { return value; }
}, z.array(identifier).nullable().optional()).transform(ids => [...new Set(ids ?? [])]);
/** Gönderilirse tüm listeyi değiştiren kimlik dizisi; gönderilmezse `undefined`. */
export const idList = z.array(identifier).transform(ids => [...new Set(ids)]);
