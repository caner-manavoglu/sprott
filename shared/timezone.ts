/**
 * Uygulamanın tek tarih referansı. "Bugün hangi gün" kararı — gecikme hesabı,
 * başlangıç tarihi alt sınırı, raporlardaki `overdue` sayacı — her yerde bu
 * saat dilimine göre verilir. Sunucunun veya tarayıcının yerel saatine
 * bırakılırsa pano ile raporlar gün sınırında birbirini tutmaz.
 */
export const APP_TIMEZONE = 'Europe/Istanbul';

/**
 * Bir anın uygulama saat dilimindeki tarihi, 'YYYY-MM-DD'. (`en-CA` biçimi ISO ile aynıdır.)
 * "Bugün hangi gün" sorusunun cevabı; parametresiz çağrılır.
 */
export const isoDate = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {timeZone: APP_TIMEZONE}).format(date);

/**
 * Takvim ızgarasındaki gibi zaten bir günü temsil eden `Date` nesnelerini
 * kendi alanlarıyla biçimler; saat dilimi çevirmez. `isoDate` ile karıştırılırsa
 * uygulama saat diliminin doğusundaki tarayıcılarda takvim bir gün kayar.
 */
export const isoParts = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** Başlangıç tarihi için en eski sınır: uygulama saat diliminde bugünden bir ay öncesi. */
export function monthAgo() {
  const [year, month, day] = isoDate().split('-').map(Number);
  return isoParts(new Date(year, month - 2, day));
}
