import { Check, ExternalLink, GitPullRequest, Pencil, Plus, RotateCcw, Trash2, XCircle } from 'lucide-react';
import { Button, Select } from '../components/ui';
import { PrStateBadge, waitingLabel } from '../components/pull-request';
import { navigate, paths } from '../routes';
import { taskCode } from '../lib/format';
import type { PrState, PullRequest, PullRequestFeed } from '../lib/types';

type Props = {
  feed: PullRequestFeed;
  busy: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canMerge: boolean;
  onProject: (projectId: number) => void;
  onNew: () => void;
  onEdit: (pullRequest: PullRequest) => void;
  onState: (pullRequest: PullRequest, state: PrState) => void;
  onDelete: (pullRequest: PullRequest) => void;
};

/**
 * Bekleyen PR'lar. Açık kayıtlar üstte ve en uzun bekleyen ilk sırada gelir;
 * sıralama sunucuda yapılır, burada yalnızca gösterilir.
 */
export function PullRequestsPage({feed, busy, canCreate, canUpdate, canDelete, canMerge, onProject, onNew, onEdit, onState, onDelete}: Props) {
  if (!feed.projects.length) {
    return <div className="empty-panel"><div><GitPullRequest size={22}/></div><strong>Görüntülenecek proje yok</strong>
      <span>Bir projeye eklendiğinizde o projenin PR’ları burada görünür.</span></div>;
  }

  const open = feed.rows.filter(row => row.state === 'open');

  return <div className="permissions-panel">
    <div className="permissions-heading">
      <div className="permission-icon"><GitPullRequest size={21}/></div>
      <div><h2>Bekleyen PR’lar</h2><p>{open.length} PR inceleme bekliyor.</p></div>
      <div className="log-filters">
        <Select value={String(feed.projectId ?? '')} disabled={busy} placeholder="Proje seçin"
          onValueChange={value => onProject(Number(value))}
          options={feed.projects.map(project => ({value: project.id, label: project.name}))}/>
        {canCreate && <Button disabled={busy} onClick={onNew}><Plus size={15}/> PR ekle</Button>}
      </div>
    </div>

    <div className="pr-list">
      {feed.rows.map(row => <article key={row.id} className="pr-card" data-state={row.state}>
        <header>
          <PrStateBadge state={row.state}/>
          <a href={row.url} target="_blank" rel="noreferrer noopener" className="pr-title">
            {row.title} <ExternalLink size={13}/>
          </a>
          <span className="pr-waiting">
            {row.state === 'open' ? waitingLabel(row.waitingDays)
              : row.state === 'merged' ? `${row.mergedByName ?? 'Bir kullanıcı'} onayladı`
              : 'merge edilmeden kapatıldı'}
          </span>
        </header>

        {row.description && <p className="pr-description">{row.description}</p>}

        <div className="pr-tasks">
          {row.tasks.map(task => <button key={task.id} type="button" className="pr-task"
            title={`${task.title} · ${task.columnName}`}
            onClick={() => navigate(paths.boardTask(row.projectId, task.id))}>
            {taskCode(task.id)} · {task.title}<small>{task.columnName}</small>
          </button>)}
          {!row.tasks.length && <span className="muted text-xs">Bağlı task yok.</span>}
        </div>

        <footer>
          <small>{row.createdByName ?? 'Bilinmeyen kişi'} ekledi</small>
          <div className="pr-actions">
            {canMerge && row.state !== 'merged' && <Button type="button" variant="outline" size="sm" disabled={busy}
              onClick={() => onState(row, 'merged')}><Check size={14}/> Onaylandı işaretle</Button>}
            {canMerge && row.state === 'open' && <Button type="button" variant="outline" size="sm" disabled={busy}
              onClick={() => onState(row, 'closed')}><XCircle size={14}/> Kapat</Button>}
            {canMerge && row.state !== 'open' && <Button type="button" variant="outline" size="sm" disabled={busy}
              onClick={() => onState(row, 'open')}><RotateCcw size={14}/> Beklemeye al</Button>}
            {canUpdate && <Button type="button" variant="ghost" size="icon" disabled={busy}
              aria-label="PR’ı düzenle" onClick={() => onEdit(row)}><Pencil size={14}/></Button>}
            {canDelete && <Button type="button" variant="ghost" size="icon" disabled={busy}
              aria-label="PR’ı sil" onClick={() => onDelete(row)}><Trash2 size={14}/></Button>}
          </div>
        </footer>
      </article>)}

      {!feed.rows.length && <div className="empty-panel"><div><GitPullRequest size={22}/></div>
        <strong>Bu projede PR yok</strong>
        <span>{canCreate ? 'İlk pull request’i ekleyin.' : 'PR eklendiğinde burada görünür.'}</span></div>}
    </div>

    <div className="permissions-foot">
      <GitPullRequest size={14}/> {feed.rows.length} PR · {open.length} tanesi bekliyor.
    </div>
  </div>;
}
