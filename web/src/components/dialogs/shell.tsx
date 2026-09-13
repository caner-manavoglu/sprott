import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui';

type Props = {
  open: boolean;
  title: string;
  description?: string;
  error?: string;
  busy: boolean;
  wide?: boolean;
  onClose: () => void;
  children: React.ReactNode;
};

/**
 * Tüm modalların ortak kabuğu: başlık, açıklama, hata satırı.
 * İşlem sürerken (busy) Esc ve dışarı tıklama kapatmayı engeller.
 */
export function DialogShell({open, title, description, error, busy, wide, onClose, children}: Props) {
  return <Dialog open={open} onOpenChange={next => {if (!next && !busy) onClose();}}>
    <DialogContent className={wide ? 'max-w-3xl' : undefined}
      onEscapeKeyDown={event => {if (busy) event.preventDefault();}}
      onPointerDownOutside={event => {if (busy) event.preventDefault();}}>
      <div>
        <DialogTitle className="text-xl font-semibold pr-6">{title}</DialogTitle>
        {description && <DialogDescription className="text-sm text-muted-foreground mt-1">{description}</DialogDescription>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {children}
    </DialogContent>
  </Dialog>;
}

/** Vazgeç + onay düğmesi ikilisi; modalların alt satırı. */
export function DialogActions({busy, onCancel, cancelLabel = 'Vazgeç', children}: {busy: boolean; onCancel: () => void; cancelLabel?: string; children?: React.ReactNode}) {
  return <div className="form-actions">
    <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>{cancelLabel}</Button>
    {children}
  </div>;
}
