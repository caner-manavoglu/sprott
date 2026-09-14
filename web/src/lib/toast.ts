export type ToastMessage = {message: string; kind: 'success' | 'error'};

export function toast(message: string, kind: ToastMessage['kind'] = 'success') {
  window.dispatchEvent(new CustomEvent<ToastMessage>('sprott-toast', {detail: {message, kind}}));
}

/** Okumalar/canlı yenilemeler sessizdir; yalnızca kullanıcının yazma işlemleri bildirilir. */
export function actionMessage(path: string, method: string, body?: unknown): string | null {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return null;
  path = path.split('?')[0];
  if (/^forums\/(receipts|\d+\/messages(?:\/\d+)?)$/.test(path)) return null;
  if (/^forums\/\d+\/members\//.test(path)) return method === 'DELETE' ? 'Forum üyeliği / isteği kaldırıldı.' : 'Forum üyeliği onaylandı.';
  const values = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (path === 'login') return 'Giriş yapıldı. Hoş geldiniz.';
  if (path === 'logout') return 'Güvenli şekilde çıkış yapıldı.';
  if (path === 'notifications/read') return 'Tüm bildirimler okundu olarak işaretlendi.';
  if (/^notifications\/\d+\/read$/.test(path)) return null;
  if (path.endsWith('/read')) return 'Duyuru okundu olarak işaretlendi.';
  if (path.startsWith('mcp/')) return method === 'DELETE' ? 'MCP bağlantısı iptal edildi.' : 'MCP bağlantı anahtarı oluşturuldu.';
  if (path.endsWith('/workflow')) return method === 'DELETE' ? 'Akış kuralları kaldırıldı.' : 'Akış kuralları kaydedildi.';
  if (path.endsWith('/completion')) return values.completed ? 'Proje tamamlandı.' : 'Proje yeniden açıldı.';
  if (path.includes('/members')) return method === 'DELETE' ? 'Üye projeden çıkarıldı.' : 'Üye projeye eklendi.';
  if (path === 'columns/order') return 'Sütun sıralaması güncellendi.';
  if (path.startsWith('permissions/')) return 'Kullanıcı yetkileri güncellendi.';
  if (path.endsWith('/state')) return values.state === 'merged' ? 'PR birleştirildi.' : values.state === 'closed' ? 'PR kapatıldı.' : 'PR yeniden açıldı.';
  if (/^tasks\/\d+$/.test(path) && method === 'PATCH' && Object.keys(values).length === 1 && 'columnId' in values) return 'Task statüsü güncellendi.';
  const subject = path.includes('/attachments') ? 'Dosya' : path.includes('/comments') ? 'Yorum' :
    ({tasks: 'Task', projects: 'Proje', users: 'Kullanıcı', groups: 'Grup', columns: 'Sütun', announcements: 'Duyuru', 'pull-requests': 'PR'} as Record<string, string>)[path.split('/')[0]];
  if (!subject) return 'İşlem tamamlandı.';
  return `${subject} ${method === 'DELETE' ? 'silindi' : method === 'POST' ? (subject === 'Dosya' ? 'yüklendi' : 'oluşturuldu') : 'güncellendi'}.`;
}
