import { Check } from 'lucide-react';
import { Button, Input } from '../ui';
import { DialogActions, DialogShell } from './shell';
import type { User } from '../../lib/types';

export type UserDraft = 'new' | User;

type Props = {
  draft: UserDraft | null;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (values: Record<string, unknown>, editing: User | null) => void;
};

export function UserDialog({draft, busy, error, onClose, onSubmit}: Props) {
  const editing = draft === 'new' || draft === null ? null : draft;
  const value = (field: keyof User) => (editing ? String(editing[field] ?? '') : '');

  return <DialogShell open={draft !== null} busy={busy} error={error} onClose={onClose}
    title={editing ? 'Kullanıcıyı düzenle' : 'Yeni kullanıcı'}
    description={editing ? 'Şifreyi boş bırakırsanız mevcut şifre korunur.' : 'Kullanıcı bu bilgilerle giriş yapacak.'}>
    {draft && <form onSubmit={event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      onSubmit({
        name: form.get('name'), surname: form.get('surname'), title: form.get('title'),
        email: form.get('email'), password: form.get('password') || undefined,
      }, editing);
    }}>
      <div className="field-row">
        <label>Ad<Input name="name" defaultValue={value('name')} maxLength={60} required autoFocus/></label>
        <label>Soyad<Input name="surname" defaultValue={value('surname')} maxLength={60} required/></label>
      </div>
      <label>Ünvan<Input name="title" placeholder="Yazılım uzmanı" defaultValue={value('title')} maxLength={80} required/></label>
      <label>E-posta<Input name="email" type="email" autoComplete="off" placeholder="ornek@sirket.com" defaultValue={value('email')} maxLength={254} required/></label>
      <label>Şifre<Input name="password" type="password" autoComplete="new-password"
        placeholder={editing ? 'Değiştirmek için yeni şifre girin' : 'En az 8 karakter'}
        minLength={8} maxLength={256} required={!editing}/></label>
      <DialogActions busy={busy} onCancel={onClose}>
        <Button disabled={busy}>{busy ? 'Kaydediliyor…' : editing ? 'Değişiklikleri kaydet' : 'Kullanıcı oluştur'}<Check size={15}/></Button>
      </DialogActions>
    </form>}
  </DialogShell>;
}
