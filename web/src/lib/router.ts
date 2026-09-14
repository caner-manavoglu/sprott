import { useSyncExternalStore } from 'react';

/**
 * History API üzerine kurulu küçük yönlendirici.
 * Uygulamanın yedi sayfası için bir kütüphaneye gerek yok: adres çubuğu
 * tek doğruluk kaynağı, bileşenler `usePath()` ile ona abone olur.
 */
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('popstate', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('popstate', listener);
  };
}

export function navigate(path: string, {replace = false} = {}) {
  if (path === location.pathname + location.search) return;
  history[replace ? 'replaceState' : 'pushState'](null, '', path);
  notify();
}

export function usePath() {
  return useSyncExternalStore(subscribe, () => location.pathname);
}

/** Adresin sorgu kısmı; filtreler burada yaşadığı için bağlantı paylaşılabilir ve yenilemede korunur. */
export function useSearch() {
  return useSyncExternalStore(subscribe, () => location.search);
}

/** Tek sorgu parametresini yazar; boş değer parametreyi siler. Geçmişe yeni kayıt eklemez. */
export function setParam(key: string, value: string) {
  const params = new URLSearchParams(location.search);
  if (value) params.set(key, value);
  else params.delete(key);
  const query = params.toString();
  history.replaceState(null, '', location.pathname + (query ? `?${query}` : ''));
  notify();
}

/** '/projeler/12' → ['projeler', '12'] */
export const segments = (path: string) => path.split('/').filter(Boolean);

/** Yol sonundaki sayısal kimlik; '/raporlar' gibi kimliksiz yollarda null. */
export function idFromPath(path: string, prefix: string) {
  const parts = segments(path);
  if (parts[0] !== prefix || parts.length < 2) return null;
  const id = Number(parts[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
