import { Check, ImagePlus, LoaderCircle, LockKeyhole, Trash2 } from 'lucide-react';
import { Avatar } from '../components/avatar';
import { Button, Input } from '../components/ui';
import { fullName } from '../lib/format';
import type { User } from '../lib/types';
import { useEffect, useRef, useState } from 'react';

export function ProfilePage({user, busy, onSave}: {user: User; busy: boolean; onSave: (body: FormData) => void}) {
  const [selected, setSelected] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => () => {if (preview) URL.revokeObjectURL(preview);}, [preview]);

  return <div className="permissions-panel profile-panel">
    <div className="permissions-heading">
      <span className="profile-avatar">{preview
        ? <span className="user-avatar"><img src={preview} alt="Seçilen profil fotoğrafı ön izlemesi"/></span>
        : <Avatar person={user}/>} {busy && <LoaderCircle className="profile-avatar-loading" size={17}/>}</span>
      <div><h2>{fullName(user)}</h2><p>{user.title}</p></div>
      {(user.hasAvatar || selected) && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => {
        if (selected) {if (fileInput.current) fileInput.current.value = ''; setSelected(null); setPreview(''); return;}
        const body = new FormData(); body.set('email', user.email); body.set('removeAvatar', 'true'); onSave(body);
      }}><Trash2 size={14}/> {selected ? 'Seçimi kaldır' : 'Fotoğrafı kaldır'}</Button>}
    </div>
    <form onSubmit={event => {event.preventDefault(); onSave(new FormData(event.currentTarget));}}>
      <label>E-posta<Input name="email" type="email" defaultValue={user.email} maxLength={254} required/></label>
      <label>Yeni şifre<Input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={256} placeholder="Değiştirmeyecekseniz boş bırakın"/></label>
      <label className="profile-upload"><ImagePlus size={18}/><span>Profil fotoğrafı
        <small className={selected ? 'profile-selected-file' : ''}>{selected?.name ?? 'JPG, PNG, WebP veya GIF · en fazla 5 MB'}</small></span>
        <span className="profile-upload-action">Dosya seç</span>
        <input ref={fileInput} name="avatar" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={event => {
          const file = event.target.files?.[0] ?? null;
          setSelected(file);
          setPreview(file ? URL.createObjectURL(file) : '');
        }}/>
      </label>
      <Button disabled={busy}>{busy ? 'Kaydediliyor…' : 'Profili kaydet'}<Check size={15}/></Button>
    </form>
    <div className="permissions-foot"><LockKeyhole size={14}/> Şifreyi boş bırakırsanız mevcut şifreniz korunur.</div>
  </div>;
}
