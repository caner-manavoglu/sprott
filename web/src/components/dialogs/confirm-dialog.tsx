import { AlertTriangle, Check, Trash2 } from 'lucide-react';
import { Button } from '../ui';
import { DialogActions, DialogShell } from './shell';

/**
 * Geri alınması zor işlemler için tek onay modalı: silmeler ve projeyi tamamlama.
 * `action` başarılı dönerse modal kapanır; hata metni modalda kalır.
 */
export type Confirmation = {
  title: string;
  description: string;
  confirmLabel: string;
  /** Silme gibi yıkıcı işlemler kırmızı düğmeyle sorulur. */
  destructive?: boolean;
  action: () => Promise<boolean>;
};

export function ConfirmDialog({request, busy, error, onClose, onDone}: {
  request: Confirmation | null;
  busy: boolean;
  error: string;
  onClose: () => void;
  onDone: () => void;
}) {
  return <DialogShell open={request !== null} busy={busy} error={error} onClose={onClose}
    title={request?.title ?? ''} description={request?.description}>
    <p className="confirm-question">
      {request?.destructive ? <Trash2 size={15}/> : <AlertTriangle size={15}/>}
      Devam etmek istiyor musunuz?
    </p>
    <DialogActions busy={busy} onCancel={onClose} cancelLabel="Hayır">
      <Button type="button" variant={request?.destructive ? 'destructive' : 'default'} disabled={busy}
        onClick={() => {void request?.action().then(ok => {if (ok) onDone();});}}>
        {busy ? 'İşleniyor…' : `Evet, ${request?.confirmLabel ?? 'onayla'}`}
        {request?.destructive ? <Trash2 size={15}/> : <Check size={15}/>}
      </Button>
    </DialogActions>
  </DialogShell>;
}
