import { useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import { Input } from './ui';
import { TaskTypeBadge } from './task-type';
import type { TaskSearchResult } from '../lib/types';

type Props = {
  value: string;
  results: TaskSearchResult[];
  open: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onOpenTask: (item: TaskSearchResult) => void;
};

/** Üst çubuktaki task araması: yazdıkça sunucudan gelen sonuçlar açılır panelde listelenir. */
export function TaskSearch({value, results, open, onChange, onClose, onOpenTask}: Props) {
  const holder = useRef<HTMLDivElement>(null);

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
  }, [open, onClose]);

  const term = value.trim();
  return <div className="task-search" ref={holder}>
    <Search size={15} aria-hidden="true"/>
    <Input type="search" value={value} placeholder="Task ara…" aria-label="Task ara" autoComplete="off"
      onChange={event => onChange(event.target.value)}/>

    {open && term.length > 1 && <div className="notification-panel" role="dialog" aria-label="Task arama sonuçları">
      <div className="notification-list">
        {results.map(item => <button type="button" key={item.id} onClick={() => onOpenTask(item)}>
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
