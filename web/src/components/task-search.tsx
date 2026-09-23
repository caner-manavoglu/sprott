import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '../api';
import { Input } from './ui';
import { TaskTypeBadge } from './task-type';
import type { TaskSearchResult } from '../lib/types';

/**
 * Üst çubuktaki task araması: yazdıkça sunucudan gelen sonuçlar açılır panelde listelenir.
 * Kullanıcı aramasıyla aynı yolu izler: gecikmeli istek, sunucuda ILIKE.
 */
export function TaskSearch({onOpenTask}: {onOpenTask: (item: TaskSearchResult) => void}) {
  const holder = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState('');
  const [results, setResults] = useState<TaskSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const onClose = () => setOpen(false);

  useEffect(() => {
    const term = value.trim();
    if (term.length < 2) { setResults([]); return; }
    const timer = setTimeout(() => {
      api<TaskSearchResult[]>(`tasks?q=${encodeURIComponent(term)}`)
        .then(found => { setResults(found); setOpen(true); })
        .catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {if (!holder.current?.contains(event.target as Node)) onClose();};
    const escape = (event: KeyboardEvent) => {if (event.key === 'Escape') onClose();};
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const term = value.trim();
  return <div className="task-search" ref={holder}>
    <Search size={15} aria-hidden="true"/>
    <Input type="search" value={value} placeholder="Task ara…" aria-label="Task ara" autoComplete="off"
      onChange={event => {setValue(event.target.value); setOpen(true);}}/>

    {open && term.length > 1 && <div className="notification-panel" role="dialog" aria-label="Task arama sonuçları">
      <div className="notification-list">
        {results.map(item => <button type="button" key={item.id} onClick={() => {setOpen(false); setValue(''); onOpenTask(item);}}>
          <span>
            <strong>{item.title}</strong>
            <small>{item.projectName} · {item.columnName}</small>
          </span>
          <TaskTypeBadge type={item.type}/>
        </button>)}
        {!results.length && <p className="notification-empty">Eşleşen task yok.</p>}
      </div>
    </div>}
  </div>;
}
