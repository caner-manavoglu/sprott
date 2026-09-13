import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, GitPullRequest, Search, X } from 'lucide-react';
import { Button, Input, Textarea } from '../ui';
import { DialogActions, DialogShell } from './shell';
import { matches, taskCode } from '../../lib/format';
import type { PullRequest } from '../../lib/types';

export type PullRequestDraft = 'new' | PullRequest;

type Props = {
  draft: PullRequestDraft | null;
  /** Bağlanabilecek task'lar; yalnızca PR'ın projesindekiler gelir. */
  tasks: {id: number; title: string}[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (values: {url: string; title: string; description: string; taskIds: number[]}, editing: PullRequest | null) => void;
};

/** PR ekleme ve düzenleme. Bağlı task sayısı serbesttir: sıfır da olabilir, çok da. */
export function PullRequestDialog({draft, tasks, busy, error, onClose, onSubmit}: Props) {
  const editing = draft === 'new' || draft === null ? null : draft;
  const [taskIds, setTaskIds] = useState<number[]>([]);
  const [query, setQuery] = useState('');
  const [picking, setPicking] = useState(false);
  const picker = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTaskIds(editing ? editing.tasks.map(task => task.id) : []);
    setQuery('');
    setPicking(false);
  }, [draft]);

  // Dışarı tıklama ve Esc yalnızca listeyi kapatır; modal açık kalır.
  useEffect(() => {
    if (!picking) return;
    const close = (event: MouseEvent) => {
      if (!picker.current?.contains(event.target as Node)) setPicking(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setPicking(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape, true);
    };
  }, [picking]);

  const toggle = (id: number) =>
    setTaskIds(current => (current.includes(id) ? current.filter(item => item !== id) : [...current, id]));

  const label = (id: number) => {
    const task = tasks.find(item => item.id === id) ?? editing?.tasks.find(item => item.id === id);
    return `${taskCode(id)} · ${task?.title ?? 'Task'}`;
  };
  const visible = tasks.filter(task => matches(`${taskCode(task.id)} ${task.title}`, query.trim()));

  return <DialogShell open={draft !== null} busy={busy} error={error} onClose={onClose}
    title={editing ? 'PR’ı düzenle' : 'PR ekle'}
    description="Pull request adresini, adını ve bağlı olduğu task’ları girin.">
    <form key={editing ? `pr-${editing.id}` : 'pr-new'} onSubmit={event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      onSubmit({
        url: String(form.get('url')).trim(),
        title: String(form.get('title')).trim(),
        description: String(form.get('description') ?? '').trim(),
        taskIds,
      }, editing);
    }}>
      <label>PR adresi
        <Input name="url" type="url" defaultValue={editing?.url ?? ''} maxLength={500} required autoFocus
          placeholder="https://github.com/kullanici/depo/pull/42"/>
      </label>
      <label>PR adı
        <Input name="title" defaultValue={editing?.title ?? ''} maxLength={200} required placeholder="Kısa başlık"/>
      </label>
      <label>Açıklama
        <Textarea name="description" defaultValue={editing?.description ?? ''} maxLength={5000} rows={3}
          placeholder="Bu PR ne yapıyor? (isteğe bağlı)"/>
      </label>

      <div className="field" ref={picker}><span>Bağlı task’lar</span>
        {!!taskIds.length && <div className="pr-chips">{taskIds.map(id =>
          <button key={id} type="button" className="filter-pill" disabled={busy}
            aria-label={`${label(id)} bağını kaldır`} onClick={() => toggle(id)}>{label(id)} <X size={12}/></button>)}
        </div>}

        {/* Liste kapalı başlar; DatePicker gibi akış içinde açılır, modalın kaydırması kırpmaz. */}
        <button type="button" className="pr-picker-trigger" disabled={busy}
          aria-expanded={picking} onClick={() => setPicking(value => !value)}>
          <GitPullRequest size={15}/>
          <span className={taskIds.length ? undefined : 'empty'}>
            {taskIds.length ? `${taskIds.length} task seçili` : 'Task seçin (isteğe bağlı)'}
          </span>
          <ChevronDown size={16}/>
        </button>

        <div className="reveal" data-open={picking} inert={!picking}><div>
          <div className="pr-picker-panel">
            <div className="pr-task-search">
              <Search size={14}/>
              <Input value={query} placeholder="Task ara…" aria-label="Task ara"
                onChange={event => setQuery(event.target.value)}/>
            </div>
            <div className="pr-task-list">
              {visible.slice(0, 50).map(task => <button key={task.id} type="button"
                className={taskIds.includes(task.id) ? 'active' : ''} aria-pressed={taskIds.includes(task.id)}
                onClick={() => toggle(task.id)}>
                <span>{taskCode(task.id)} · {task.title}</span>
                {taskIds.includes(task.id) && <Check size={14}/>}
              </button>)}
              {!visible.length && <p className="muted text-xs">Eşleşen task yok.</p>}
              {/* Uzun listelerde ilk 50 gösterilir; gerisine arama ile ulaşılır. */}
              {visible.length > 50 && <p className="muted text-xs">+{visible.length - 50} task daha · aramayla daraltın.</p>}
            </div>
          </div>
        </div></div>
      </div>

      <DialogActions busy={busy} onCancel={onClose}>
        <Button disabled={busy}>{busy ? 'Kaydediliyor…' : editing ? 'Değişiklikleri kaydet' : 'PR ekle'}
          <GitPullRequest size={15}/></Button>
      </DialogActions>
    </form>
  </DialogShell>;
}
