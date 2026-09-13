import { useState } from 'react';
import { toast } from './toast';

/**
 * Sunucu çağrılarının ortak kabuğu: çalışırken `busy`, hata olursa `error`.
 * Her çağrı öncesi hata temizlenir, böylece ekranda eski uyarı kalmaz.
 */
export function useAsync() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(action: () => Promise<void>) {
    setError('');
    setBusy(true);
    try {
      await action();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Bağlantı kurulamadı.';
      setError(message);
      toast(message, 'error');
      return false;
    } finally {
      setBusy(false);
    }
  }

  return {busy, error, setError, run};
}
