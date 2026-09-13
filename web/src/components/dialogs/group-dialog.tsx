import { useEffect, useState } from 'react';
import { Check, GripVertical, Plus, X } from 'lucide-react';
import { Button, Input } from '../ui';
import { DialogActions, DialogShell } from './shell';
import { fullName } from '../../lib/format';
import type { Group, Member } from '../../lib/types';

export type GroupDraft = 'new' | Group;

/** Kartın bırakılabileceği üç alan: üyeler, grup yöneticileri ve atanmamış havuz. */
type Zone = 'members' | 'managers' | 'pool';

type Props = {
  draft: GroupDraft | null;
  candidates: Member[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (values: {name: string; memberIds: number[]; managerIds: number[]}, editing: Group | null) => void;
};

export function GroupDialog({draft, candidates, busy, error, onClose, onSubmit}: Props) {
  const editing = draft === 'new' || draft === null ? null : draft;
  const [memberIds, setMemberIds] = useState<number[]>([]);
  const [managerIds, setManagerIds] = useState<number[]>([]);
  const [hovered, setHovered] = useState<Zone | null>(null);

  useEffect(() => {
    setMemberIds(editing ? editing.members.map(person => person.id) : []);
    setManagerIds(editing ? editing.managers.map(person => person.id) : []);
  }, [draft]);

  /** Bir kişi tek rolde durur: üye, grup yöneticisi ya da hiçbiri. */
  const assign = (id: number, zone: Zone) => {
    setMemberIds(current => (zone === 'members' ? [...new Set([...current, id])] : current.filter(item => item !== id)));
    setManagerIds(current => (zone === 'managers' ? [...new Set([...current, id])] : current.filter(item => item !== id)));
  };

  const card = (person: Member, actions: React.ReactNode) =>
    <div className="member-row" key={person.id} draggable={!busy} onDragStart={event => {
      event.dataTransfer.setData('text/plain', String(person.id));
      event.dataTransfer.effectAllowed = 'move';
    }}>
      <GripVertical size={14} className="drag-handle"/>
      <span className="user-avatar">{person.name[0]}</span>
      <div className="member-info"><strong>{fullName(person)}</strong>{person.title && <small>{person.title}</small>}</div>
      {actions}
    </div>;

  const zone = (target: Zone, heading: string, hint: string, people: Member[], actions: (person: Member) => React.ReactNode, empty: string) =>
    <section className={`permission-group drop-zone ${target === 'pool' ? 'pool' : ''} ${hovered === target ? 'drag-over' : ''}`}
      onDragOver={event => {event.preventDefault(); setHovered(target);}}
      onDragLeave={event => {if (!event.currentTarget.contains(event.relatedTarget as Node)) setHovered(null);}}
      onDrop={event => {
        event.preventDefault();
        setHovered(null);
        const id = Number(event.dataTransfer.getData('text/plain'));
        if (Number.isSafeInteger(id) && id > 0 && !busy) assign(id, target);
      }}>
      <h3>{heading} ({people.length})</h3>
      <p className="muted text-xs">{hint}</p>
      <div className="member-list">{people.map(person => card(person, actions(person)))}</div>
      {!people.length && <p className="muted text-xs drop-empty">{empty}</p>}
    </section>;

  const removeButton = (person: Member, label: string) =>
    <Button type="button" variant="ghost" size="icon" disabled={busy} aria-label={`${fullName(person)} ${label}`}
      onClick={() => assign(person.id, 'pool')}><X size={15}/></Button>;

  const pool = candidates.filter(person => !memberIds.includes(person.id) && !managerIds.includes(person.id));

  return <DialogShell open={draft !== null} busy={busy} error={error} wide onClose={onClose}
    title={editing ? 'Grubu düzenle' : 'Yeni grup'}
    description="Grup adını verin, üyeleri ve varsa grup yöneticilerini seçin.">
    {draft && <form onSubmit={event => {
      event.preventDefault();
      const name = String(new FormData(event.currentTarget).get('name'));
      onSubmit({name, memberIds, managerIds}, editing);
    }}>
      <label>Grup adı<Input name="name" placeholder="Frontend" defaultValue={editing?.name ?? ''} maxLength={60} required autoFocus/></label>

      <div className="group-picker">
        {zone('members', 'Üyeler', 'Gruba dahil olan kullanıcılar.',
          candidates.filter(person => memberIds.includes(person.id)),
          person => removeButton(person, 'üyelikten çıkar'), 'Buraya kullanıcı sürükleyin.')}
        {zone('managers', 'Grup yöneticileri', 'Boş bırakılabilir. Üyelerin task’larını panoda geri alabilirler.',
          candidates.filter(person => managerIds.includes(person.id)),
          person => removeButton(person, 'yöneticilikten çıkar'), 'Buraya kullanıcı sürükleyin.')}
      </div>

      {zone('pool', 'Kullanıcılar', 'Kartları yukarıdaki alanlara sürükleyin ya da düğmelerle atayın.', pool,
        person => <span className="row-actions">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => assign(person.id, 'members')}>
            <Plus size={14}/> Üye
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => assign(person.id, 'managers')}>
            <Plus size={14}/> Yönetici
          </Button>
        </span>, 'Tüm kullanıcılar atandı.')}

      <DialogActions busy={busy} onCancel={onClose}>
        <Button disabled={busy}>{busy ? 'Kaydediliyor…' : editing ? 'Değişiklikleri kaydet' : 'Grup oluştur'}<Check size={15}/></Button>
      </DialogActions>
    </form>}
  </DialogShell>;
}
