import { useEffect, useState } from 'react';
import { Check, Image, Megaphone, X } from 'lucide-react';
import { Button, Input, Textarea } from '../ui';
import { DialogActions, DialogShell } from './shell';
import type { Announcement } from '../../lib/types';

/** 'new' yeni duyuru, bir duyuru kaydı ise düzenleme demektir. */
export type AnnouncementDraft = 'new' | Announcement;

export type AnnouncementValues = {
  title: string;
  body: string;
  mandatory: boolean;
  groupIds: number[];
  image: File | null;
  /** Yalnızca düzenlemede anlamlı: mevcut görseli kaldırır. */
  removeImage: boolean;
};

type Props = {
  draft: AnnouncementDraft | null;
  /** Duyuru yapılabilecek gruplar: yönetici için tümü, grup yöneticisi için yönettikleri. */
  groups: {id: number; name: string}[];
  /** Yalnızca yöneticiler duyuruyu herkese açabilir. */
  canTargetEveryone: boolean;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (values: AnnouncementValues, editing: Announcement | null) => void;
};

export function AnnouncementDialog({draft, groups, canTargetEveryone, busy, error, onClose, onSubmit}: Props) {
  const editing = draft === 'new' || draft === null ? null : draft;
  const [groupIds, setGroupIds] = useState<number[]>([]);
  const [mandatory, setMandatory] = useState(false);
  const [image, setImage] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);

  useEffect(() => {
    if (!draft) return;
    setGroupIds(editing ? editing.groups.map(group => group.id) : []);
    setMandatory(false);
    setImage(null);
    setRemoveImage(false);
  }, [draft]);

  const toggle = (id: number) =>
    setGroupIds(current => (current.includes(id) ? current.filter(item => item !== id) : [...current, id]));

  // Grup yöneticisi herkese duyuru yapamaz; boş seçim yönettiği tüm gruplara gider.
  const everyone = canTargetEveryone && !groupIds.length;
  const keepsImage = !!editing?.hasImage && !image && !removeImage;

  return <DialogShell open={draft !== null} busy={busy} error={error} onClose={onClose}
    title={editing ? 'Duyuruyu düzenle' : 'Yeni duyuru'}
    description={canTargetEveryone
      ? 'Duyuruyu herkese ya da seçtiğiniz gruplara açabilirsiniz.'
      : 'Duyuru yalnızca yönettiğiniz gruplara gider.'}>
    {draft && <form onSubmit={event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      onSubmit(
        {title: String(form.get('title')), body: String(form.get('body')), mandatory, groupIds, image, removeImage},
        editing,
      );
    }}>
      <label>Başlık<Input name="title" placeholder="Ofis taşınıyor" defaultValue={editing?.title ?? ''} maxLength={160} required autoFocus/></label>
      <label>Açıklama<Textarea name="body" placeholder="Duyuru metnini yazın." defaultValue={editing?.body ?? ''} maxLength={5000} required/></label>

      <div className="field">
        <span>Hedef gruplar</span>
        <p className="muted text-xs">{everyone
          ? 'Hiç grup seçilmedi: duyuru tüm kullanıcılara açılır.'
          : groupIds.length
          ? 'Yalnızca seçili grupların üyeleri görür.'
          : 'Hiç grup seçilmedi: duyuru yönettiğiniz tüm gruplara gider.'}</p>
        <div className="permission-tags">
          {groups.map(group => <button type="button" key={group.id} disabled={busy}
            className={`permission-tag selectable${groupIds.includes(group.id) ? ' selected' : ''}`}
            aria-pressed={groupIds.includes(group.id)} onClick={() => toggle(group.id)}>
            {groupIds.includes(group.id) && <Check size={12}/>}{group.name}
          </button>)}
          {!groups.length && <span className="permission-summary">Grup bulunmuyor.</span>}
        </div>
      </div>

      {/* Zorunluluk yalnızca duyuru açılırken belirlenir; zorunlu duyurular sonradan düzenlenemez. */}
      {!editing && <label className="switch-label permission-row"
        title="Açıkken duyuruyu hiç görmemiş kişilere girişte modal olarak açılır. Zorunlu duyurular sonradan düzenlenemez, yalnızca silinebilir.">
        <input type="checkbox" role="switch" checked={mandatory} disabled={busy}
          onChange={event => setMandatory(event.target.checked)}/>
        <span className="switch-track"/>
        <span className="switch-text"><Megaphone size={14}/> Zorunlu duyuru</span>
      </label>}

      <div className="field">
        <span>Görsel (isteğe bağlı)</span>
        <label className="attachment-select">
          <Image size={17}/>
          <span>{image ? image.name : keepsImage ? 'Mevcut görsel korunuyor; değiştirmek için tıklayın' : 'Görsel seçmek için tıklayın'}</span>
          <input type="file" accept="image/*" disabled={busy}
            onChange={event => {setImage(event.target.files?.[0] ?? null); setRemoveImage(false);}}/>
        </label>
        {keepsImage && <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setRemoveImage(true)}>
          <X size={14}/> Görseli kaldır
        </Button>}
        {removeImage && <p className="muted text-xs">Kaydedince mevcut görsel kaldırılacak.</p>}
      </div>

      <DialogActions busy={busy} onCancel={onClose}>
        <Button disabled={busy}>
          {busy ? 'Kaydediliyor…' : editing ? 'Değişiklikleri kaydet' : 'Duyuruyu yayımla'}<Check size={15}/>
        </Button>
      </DialogActions>
    </form>}
  </DialogShell>;
}
