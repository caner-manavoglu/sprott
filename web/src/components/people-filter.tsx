import { useEffect, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { Input } from './ui';
import { api } from '../api';
import { fullName, matches } from '../lib/format';
import type { User } from '../lib/types';
import { Avatar } from './avatar';

type Props = {
  members: User[];
  selected: number[];
  onToggle: (id: number) => void;
  onClear: () => void;
};

const VISIBLE_CHIPS = 5;

/**
 * Pano üstündeki kişi filtresi. Arama kutusu kullanıcı modülünün
 * `GET /api/users?search=` ucuna sorar (ILIKE, büyük/küçük harf duyarsız);
 * yetki yoksa proje üyeleri arasında yerel arama yapılır.
 */
export function PeopleFilter({members, selected, onToggle, onClear}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest('.board-people')) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      const term = query.trim();
      api<User[]>(`users?search=${encodeURIComponent(term)}`)
        .then(setResults)
        .catch(() => setResults(members.filter(person => matches(fullName(person), term))));
    }, 200);
    return () => clearTimeout(timer);
  }, [open, query, members]);

  const nameOf = (id: number) =>
    fullName(members.find(person => person.id === id) ?? results.find(person => person.id === id) ?? {name: 'Seçili', surname: 'kişi'});

  return <>
    {!!members.length && <div className="board-people">
      {members.slice(0, VISIBLE_CHIPS).map(person => <button key={person.id} type="button"
        className={`people-chip ${selected.includes(person.id) ? 'active' : ''}`}
        title={`${fullName(person)} · yalnızca bu kişinin task’ları`}
        aria-pressed={selected.includes(person.id)} onClick={() => onToggle(person.id)}>
        <Avatar person={person} className="people-avatar"/><span className="people-name">{fullName(person)}</span>
      </button>)}

      {members.length > VISIBLE_CHIPS && <button type="button" className="people-chip more" title="Tüm üyeler" onClick={() => setOpen(value => !value)}>
        +{members.length - VISIBLE_CHIPS}
      </button>}

      <button type="button" className="people-search" aria-expanded={open} aria-label="Üye ara" title="Üye ara" onClick={() => setOpen(value => !value)}>
        <Search size={14}/>
      </button>

      {open && <div className="people-panel">
        <Input autoFocus value={query} placeholder="İsimle ara…" aria-label="Üye ara" onChange={event => setQuery(event.target.value)}/>
        <div className="people-results">
          {results.map(person => <button key={person.id} type="button"
            className={selected.includes(person.id) ? 'active' : ''}
            aria-pressed={selected.includes(person.id)} onClick={() => onToggle(person.id)}>
            <Avatar person={person} className="people-chip"/>
            <span>{fullName(person)}</span>
            {selected.includes(person.id) && <Check size={14}/>}
          </button>)}
          {!results.length && <p className="muted text-xs">Eşleşen kullanıcı yok.</p>}
        </div>
      </div>}
    </div>}

    {selected.map(id => <button key={id} type="button" className="filter-pill" onClick={() => onToggle(id)}>
      {nameOf(id)} <X size={12}/>
    </button>)}
    {selected.length > 1 && <button type="button" className="filter-pill" onClick={onClear}>Filtreyi temizle <X size={12}/></button>}
  </>;
}
