import axios from 'axios';

export let authToken = '';
try { authToken = localStorage.getItem('sprott-token') || ''; } catch { /* Storage may be unavailable. */ }
export function setToken(value: string) {
  authToken = value;
  try { value ? localStorage.setItem('sprott-token', value) : localStorage.removeItem('sprott-token'); } catch { /* Token still works for this tab. */ }
}
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  try {
    const { data } = await axios.request<T>({
      baseURL: '/api/', url: path, method, data: body,
      headers: authToken ? {Authorization: `Bearer ${authToken}`} : {},
      responseType: 'json', transitional: {silentJSONParsing: false},
    });
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      if (error.response.status === 401 && path !== 'login') {
        setToken('');
        window.dispatchEvent(new Event('session-expired'));
      }
      throw new Error(error.response.data?.message || 'İşlem tamamlanamadı.');
    }
    throw new Error('Sunucuya ulaşılamıyor. Lütfen tekrar deneyin.');
  }
}

export async function apiBlob(path: string): Promise<Blob> {
  try {
    const {data} = await axios.get<Blob>(`/api/${path}`, {
      headers: authToken ? {Authorization: `Bearer ${authToken}`} : {}, responseType: 'blob',
    });
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
