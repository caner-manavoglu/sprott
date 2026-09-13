import { authToken, setToken } from '../api';

/** Bearer başlığıyla SSE; bağlantı kopunca yeniden bağlanır ve veriyi tazeler. */
export function subscribeLive(onChange: () => void) {
  const controller = new AbortController();
  let retry: ReturnType<typeof setTimeout>;
  async function connect() {
    try {
      const response = await fetch('/api/live', {headers: {Authorization: `Bearer ${authToken}`}, signal: controller.signal});
      if (response.status === 401) {setToken(''); window.dispatchEvent(new Event('session-expired')); return;}
      if (!response.ok || !response.body) throw new Error('Live connection failed');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!controller.signal.aborted) {
        const {done, value} = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, {stream: true});
        let boundary: number;
        while ((boundary = buffer.indexOf('\n\n')) !== -1) {
          if (buffer.slice(0, boundary).includes('data: changed')) onChange();
          buffer = buffer.slice(boundary + 2);
        }
      }
    } catch { /* Geçici bağlantı hatalarında tekrar dene. */ }
    if (!controller.signal.aborted) retry = setTimeout(connect, 2000);
  }
  void connect();
  return () => {controller.abort(); clearTimeout(retry);};
}
