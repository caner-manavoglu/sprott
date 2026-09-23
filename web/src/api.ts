import axios from 'axios';
import { actionMessage, toast } from './lib/toast';

// Oturum httpOnly çerezde taşınır; JavaScript token'ı görmez. Eski sürümün sakladığı token silinir.
try { localStorage.removeItem('sprott-token'); } catch { /* Storage may be unavailable. */ }

/** Oturum süresi dolduğunda arayüz giriş ekranına döner. */
export const sessionExpired = () => window.dispatchEvent(new Event('session-expired'));
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  try {
    const { data } = await axios.request<T>({
      baseURL: '/api/', url: path, method, data: body,
      responseType: 'json', transitional: {silentJSONParsing: false},
    });
    const message = actionMessage(path, method.toUpperCase(), body);
    if (message) toast(message);
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      if (error.response.status === 401 && path !== 'login') sessionExpired();
      throw new Error(error.response.data?.message || 'İşlem tamamlanamadı.');
    }
    throw new Error('Sunucuya ulaşılamıyor. Lütfen tekrar deneyin.');
  }
}

export async function apiBlob(path: string): Promise<Blob> {
  try {
    const {data} = await axios.get<Blob>(`/api/${path}`, {responseType: 'blob'});
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) throw new Error('Dosya alınamadı.');
    throw new Error('Sunucuya ulaşılamıyor. Lütfen tekrar deneyin.');
  }
}

export function fileBody(files: File[], field = 'files') {
  const body = new FormData();
  files.forEach(file => body.append(field, file));
  return body;
}
