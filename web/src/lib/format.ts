import type { Board, Column, Task, User } from './types';
import { isoDate } from '../../../shared/timezone';

export const fullName = (person: {name: string; surname: string}) => `${person.name} ${person.surname}`.trim();

export const initials = (person: {name: string; surname: string}) =>
  `${person.name[0] ?? ''}${person.surname[0] ?? ''}`.toUpperCase() || '?';

export const taskCode = (id: number) => `TASK-${String(id).padStart(3, '0')}`;

export const roleLabel = (role: User['role']) => (role === 'admin' ? 'Yönetici' : 'Kullanıcı');

/** Yöneticiler tüm yetkilere sahiptir; personel için anahtar açıkça verilmiş olmalı. */
export const allowed = (person: User | null, key: string) =>
  !!person && (person.role === 'admin' || person.permissions?.[key] === true);

/** Türkçe karakterleri doğru küçülten karşılaştırma; yerel arama kutularında kullanılır. */
export const matches = (haystack: string, needle: string) =>
  haystack.toLocaleLowerCase('tr').includes(needle.toLocaleLowerCase('tr'));

/**
 * Uygulama saat dilimine göre 'YYYY-MM-DD'; `<input type="date">` ve gün
 * karşılaştırmaları bunu kullanır. Tarayıcının yerel saatine bırakılırsa
 * başka saat dilimindeki kullanıcı gecikmeyi sunucudan farklı gün görür.
 */
export { isoDate, isoParts, monthAgo } from '../../../shared/timezone';

export const dateLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('tr-TR', {day: '2-digit', month: 'short', year: 'numeric'});

/**
 * Gecikme: bitiş tarihi geçmiş ve task projesinin son sütununda değil.
 * Son sütun "tamamlandı" sayıldığı için orada bekleyen task kırmızıya boyanmaz.
 */
export const isOverdue = (task: Pick<Task, 'dueDate' | 'columnId'>, columns: Column[]) =>
  !!task.dueDate && task.dueDate < isoDate() && task.columnId !== columns[columns.length - 1]?.id;

/** Gecikme gün sayısı; gecikmemiş task'larda 0. */
export const daysLate = (dueDate: string) =>
  Math.max(0, Math.round((Date.parse(`${isoDate()}T00:00:00`) - Date.parse(`${dueDate}T00:00:00`)) / 86400000));

/**
 * Sütun geçişi serbest mi: yöneticiler akış kurallarına takılmaz, kural tanımlı
 * olmayan projelerde her geçiş serbesttir. Sunucu da aynı kuralı uygular.
 */
export const canMove = (board: Board, isAdmin: boolean, fromColumnId: number, toColumnId: number) =>
  isAdmin || fromColumnId === toColumnId || !board.transitions.length
  || board.transitions.some(step => step.fromColumnId === fromColumnId && step.toColumnId === toColumnId);
