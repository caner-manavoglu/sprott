import { useEffect, useState } from 'react';
import { Check, UserPlus, X } from 'lucide-react';
import { Button, DatePicker, Input, Textarea } from '../ui';
import { DialogActions, DialogShell } from './shell';
import { fullName, roleLabel } from '../../lib/format';
import type { Project, User } from '../../lib/types';

export type ProjectDraft = 'new' | Project;

export function ProjectDialog({draft, busy, error, onClose, onSubmit}: {
  draft: ProjectDraft | null; busy: boolean; error: string;
  onClose: () => void;
  onSubmit: (values: {name: string; description: string; startDate: string; endDate: string}, editing: Project | null) => void;
}) {
  const editing = draft === 'new' || draft === null ? null : draft;
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  // Modal açıldığında kayıttaki tarihlerle başlar; yeni projede boş kalır.
  useEffect(() => {
    setStart(editing?.startDate ?? '');
    setEnd(editing?.endDate ?? '');
  }, [draft]);

  return <DialogShell open={draft !== null} busy={busy} error={error} onClose={onClose}
    title={editing ? 'Projeyi düzenle' : 'Yeni proje'}
    description={editing ? 'Proje adını ve açıklamasını güncelleyin.' : 'Proje varsayılan sütunlarla birlikte oluşturulur.'}>
    <form key={editing?.id ?? 'new'} onSubmit={event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      onSubmit({name: String(form.get('name')), description: String(form.get('description') || ''), startDate: start, endDate: end}, editing);
    }}>
      <label>Proje adı<Input name="name" defaultValue={editing?.name ?? ''} placeholder="Örn. Mobil uygulama" maxLength={80} required autoFocus/></label>
      <label>Açıklama<Textarea name="description" defaultValue={editing?.description ?? ''} placeholder="Proje hakkında kısa not" maxLength={2000}/></label>
      {/* Tarihler isteğe bağlı; kural uygulanmaz, yalnızca proje listesinde görünür. */}
      <div className="field-row">
        <div className="field"><span>Başlangıç tarihi</span>
          <DatePicker name="startDate" value={start} onChange={setStart} clearable
            placeholder="Tarih yok (isteğe bağlı)" ariaLabel="Proje başlangıç tarihi"/>
        </div>
        <div className="field"><span>Bitiş tarihi</span>
          <DatePicker name="endDate" value={end} onChange={setEnd} clearable
            placeholder="Tarih yok (isteğe bağlı)" ariaLabel="Proje bitiş tarihi"/>
        </div>
      </div>
      <DialogActions busy={busy} onCancel={onClose}>
        <Button disabled={busy}>{busy ? 'Kaydediliyor…' : editing ? 'Kaydet' : 'Proje oluştur'}<Check size={15}/></Button>
      </DialogActions>
    </form>
  </DialogShell>;
}

export function ProjectMembersDialog({project, members, everyone, busy, error, onClose, onAdd, onRemove}: {
  project: Project | null; members: User[]; everyone: User[]; busy: boolean; error: string;
  onClose: () => void; onAdd: (person: User) => void; onRemove: (person: User) => void;
}) {
  const candidates = everyone.filter(person => !members.some(member => member.id === person.id));

  return <DialogShell open={project !== null} busy={busy} error={error} onClose={onClose}
    title="Proje üyeleri" description={project ? `${project.name} · task’lar yalnızca üyelere atanabilir.` : undefined}>
    <p className="field-label">Proje üyeleri ({members.length})</p>
    <div className="member-list">
      {members.map(person => <div className="member-row" key={person.id}>
        <span className="user-avatar">{person.name[0]}</span>
        <div className="member-info"><strong>{fullName(person)}</strong><small>{person.title || person.email}</small></div>
        <span className={`person-role ${person.role}`}>{roleLabel(person.role)}</span>
        <Button type="button" variant="ghost" size="icon" aria-label={`${fullName(person)} üyeliğini kaldır`}
          disabled={busy} onClick={() => onRemove(person)}><X size={16}/></Button>
      </div>)}
      {!members.length && <p className="muted text-xs">Bu projede henüz üye yok.</p>}
    </div>

    <p className="field-label">Eklenebilecek kullanıcılar</p>
    <div className="member-list">
      {candidates.map(person => <div className="member-row" key={person.id}>
        <span className="user-avatar">{person.name[0]}</span>
        <div className="member-info"><strong>{fullName(person)}</strong><small>{person.title || person.email}</small></div>
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onAdd(person)}>
          <UserPlus size={15}/> Ekle
        </Button>
      </div>)}
      {!candidates.length && <p className="muted text-xs">Eklenebilecek başka kullanıcı yok.</p>}
    </div>

    <DialogActions busy={busy} onCancel={onClose} cancelLabel="Kapat"/>
  </DialogShell>;
}
