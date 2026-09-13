import type { Board } from './lib/types';
import { idFromPath, segments } from './lib/router';

/** Uygulamanın sayfaları; adres çubuğundaki yol ile birebir eşleşir. */
export type PageKey = 'dashboard' | 'projects' | 'board' | 'permissions' | 'users' | 'groups' | 'reports' | 'notifications' | 'announcements' | 'logs';

export const paths = {
  dashboard: '/dashboard',
  projects: '/projeler',
  board: (projectId: number) => `/projeler/${projectId}`,
  /** Bildirimden gelen bağlantı: pano açılır ve task detayları kendiliğinden açılır. */
  boardTask: (projectId: number, taskId: number) => `/projeler/${projectId}/task/${taskId}`,
  permissions: '/yetkiler',
  users: '/kullanicilar',
  groups: '/gruplar',
  reports: '/raporlar',
  reportDetail: (personId: number) => `/raporlar/${personId}`,
  notifications: '/bildirimler',
  announcements: '/duyurular',
  /** Duyuru okuma raporu; yalnızca duyuruyu yazan kişi ve yöneticiler açabilir. */
  announcementDetail: (announcementId: number) => `/duyurular/${announcementId}`,
  logs: '/loglar',
} as const;

export type PageInfo = {crumb: string; eyebrow: string; heading: string; description: string};

export const pageTitles: Record<PageKey, PageInfo> = {
  dashboard: {crumb: 'Özet', eyebrow: 'GÜNE BAŞLARKEN', heading: 'Özet', description: 'Projelerin durumunu tek bakışta görün.'},
  projects: {crumb: 'Projeler', eyebrow: 'ÇALIŞMA ALANI', heading: 'Projeler', description: 'Projeleri yönetin, üyelerini belirleyin ve panolarına geçin.'},
  board: {crumb: 'Pano', eyebrow: 'EKİP ÇALIŞMALARI', heading: 'Çalışma panosu', description: 'İşleri planlayın, ilerlemeyi birlikte takip edin.'},
  permissions: {crumb: 'Yetkiler', eyebrow: 'ERİŞİM YÖNETİMİ', heading: 'Kullanıcı yetkileri', description: 'Ekip üyelerinin modül yetkilerini düzenleyin.'},
  users: {crumb: 'Kullanıcılar', eyebrow: 'EKİP YÖNETİMİ', heading: 'Kullanıcılar', description: 'Ekip üyelerini oluşturun, bilgilerini güncelleyin. Buradaki e-posta ve şifre ile giriş yaparlar.'},
  groups: {crumb: 'Gruplar', eyebrow: 'EKİP YÖNETİMİ', heading: 'Gruplar', description: 'Kullanıcıları gruplara ayırın. Bir kullanıcı birden fazla grupta yer alabilir.'},
  notifications: {crumb: 'Bildirimler', eyebrow: 'HABERLER', heading: 'Bildirimler', description: 'Size atanan task’lar, etiketlendiğiniz yorumlar ve tamamlanan işler burada toplanır.'},
  reports: {crumb: 'Raporlar', eyebrow: 'ÖLÇÜM', heading: 'Raporlar', description: 'Projelerin son sütununa taşınan, yani tamamlanan task sayıları.'},
  announcements: {crumb: 'Duyurular', eyebrow: 'HABERLEŞME', heading: 'Duyurular', description: 'Ekibe açık duyurular. Zorunlu duyurular okunana kadar girişte karşınıza çıkar.'},
  logs: {crumb: 'Loglar', eyebrow: 'DENETİM İZİ', heading: 'Etkinlik günlüğü', description: 'Kim, ne zaman task açtı, statü değiştirdi, yorum attı veya task sildi. Kayıtlar salt okunurdur.'},
};

/** Yetki anahtarları da sayfa başına tek yerde durur. */
export const moduleLabels: Record<string, string> = {
  project: 'Proje modülü', task: 'Task modülü', user: 'Kullanıcı modülü', group: 'Grup modülü', report: 'Rapor modülü',
  log: 'Log modülü',
  announcement: 'Duyuru modülü',
  workflow: 'Akış modülü',
};

export type Route =
  | {page: Exclude<PageKey, 'board' | 'reports' | 'announcements'>}
  | {page: 'board'; projectId: number; taskId: number | null}
  | {page: 'reports'; personId: number | null}
  | {page: 'announcements'; announcementId: number | null};

/** Adres çubuğundaki yolu sayfaya çevirir; tanınmayan yol özete düşer. */
export function matchRoute(path: string): Route {
  const [first] = segments(path);
  switch (first) {
    case undefined:
    case 'dashboard': return {page: 'dashboard'};
    case 'projeler': {
      const projectId = idFromPath(path, 'projeler');
      if (projectId === null) return {page: 'projects'};
      // '/projeler/12/task/34' panoyu açar ve o task'ın detayını gösterir.
      const [, , marker, taskValue] = segments(path);
      const taskId = marker === 'task' ? Number(taskValue) : NaN;
      return {page: 'board', projectId, taskId: Number.isSafeInteger(taskId) && taskId > 0 ? taskId : null};
    }
    case 'yetkiler': return {page: 'permissions'};
    case 'kullanicilar': return {page: 'users'};
    case 'gruplar': return {page: 'groups'};
    case 'loglar': return {page: 'logs'};
    case 'bildirimler': return {page: 'notifications'};
    case 'duyurular': return {page: 'announcements', announcementId: idFromPath(path, 'duyurular')};
    case 'raporlar': return {page: 'reports', personId: idFromPath(path, 'raporlar')};
    default: return {page: 'dashboard'};
  }
}

/** Sayfa başlığı; pano açıkken proje adı başlığın yerine geçer. */
export function headingFor(route: Route, board: Board): PageInfo {
  const base = pageTitles[route.page];
  if (route.page !== 'board' || !board.project) return base;
  return {...base, heading: board.project.name, description: board.project.description || base.description};
}

/** Yönlendirme yardımcıları tek kapıdan sunulur. */
export { navigate, usePath } from './lib/router';
