import { sessionExpired } from '../api';

/**
 * Oturum çereziyle SSE; bağlantı kopunca yeniden bağlanır ve veriyi tazeler.
 * `projectId` yalnızca o projenin panosu değiştiğinde doludur; null "her şey olabilir" demektir.
 */
export function subscribeLive(onChange: (projectId: number | null) => void) {
  const controller = new AbortController();
  let retry: ReturnType<typeof setTimeout>;
  async function connect() {
    try {
      const response = await fetch('/api/live', {signal: controller.signal});
      if (response.status === 401) {sessionExpired(); return;}
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
          const data = buffer.slice(0, boundary).match(/^data: (changed|project:(\d+))$/m);
          if (data) onChange(data[2] ? Number(data[2]) : null);
          buffer = buffer.slice(boundary + 2);
        }
      }
    } catch { /* Geçici bağlantı hatalarında tekrar dene. */ }
    if (!controller.signal.aborted) retry = setTimeout(connect, 2000);
  }
  void connect();
  return () => {controller.abort(); clearTimeout(retry);};
}
