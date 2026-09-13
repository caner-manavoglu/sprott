import { ArrowRight, Check, GitPullRequest, MessageSquare, Plus, ScrollText, Trash2, Unlink, UserPlus } from 'lucide-react';
import { Select } from '../components/ui';
import type { ActivityLog, LogAction } from '../lib/types';

const stamp = new Intl.DateTimeFormat('tr-TR', {dateStyle: 'medium', timeStyle: 'short'});

/** Kayıt türünün ikonu ve okunur karşılığı. */
const actions: Record<LogAction, {label: string; icon: React.ReactNode; tone: string}> = {
  'task.create': {label: 'Task açtı', icon: <Plus size={13}/>, tone: 'create'},
  'task.move': {label: 'Statü değiştirdi', icon: <ArrowRight size={13}/>, tone: 'move'},
  'task.assign': {label: 'Atama değiştirdi', icon: <UserPlus size={13}/>, tone: 'assign'},
  'task.delete': {label: 'Task sildi', icon: <Trash2 size={13}/>, tone: 'delete'},
  'comment.create': {label: 'Yorum attı', icon: <MessageSquare size={13}/>, tone: 'comment'},
  'pr.link': {label: 'PR bağladı', icon: <GitPullRequest size={13}/>, tone: 'pr'},
  'pr.unlink': {label: 'PR bağını kaldırdı', icon: <Unlink size={13}/>, tone: 'pr'},
  'pr.merge': {label: 'PR onayladı', icon: <Check size={13}/>, tone: 'create'},
};

type Props = {
  log: ActivityLog | null;
  busy: boolean;
  taskId: number | null;
  onProject: (projectId: number) => void;
  onTask: (taskId: number | null) => void;
};

/**
 * Etkinlik günlüğü. Salt okunur: listeleme dışında bir işlem yoktur,
 * kayıtlar eskiden yeniye kronolojik sırayla gelir.
 */
export function LogsPage({log, busy, taskId, onProject, onTask}: Props) {
  if (log && !log.projects.length) {
    return <div className="empty-panel"><div><ScrollText size={22}/></div><strong>Görüntülenecek proje yok</strong>
      <span>Bir projeye eklendiğinizde o projenin günlüğü burada görünür.</span></div>;
  }

  return <div className="permissions-panel">
    <div className="permissions-heading">
      <div className="permission-icon"><ScrollText size={21}/></div>
      <div><h2>Etkinlik günlüğü</h2><p>Kayıtlar yalnızca okunur; silinemez ve değiştirilemez.</p></div>
      <div className="log-filters">
        <Select value={String(log?.projectId ?? '')} disabled={busy} placeholder="Proje seçin"
          onValueChange={value => onProject(Number(value))}
          options={(log?.projects ?? []).map(project => ({value: project.id, label: project.name}))}/>
        {/* Projedeki task'lar listelenir; "Tümü" bütün kayıtları gösterir. */}
        <Select value={String(taskId ?? 0)} disabled={busy} placeholder="Tüm task’lar"
          onValueChange={value => onTask(Number(value) || null)}
          options={[{value: 0, label: 'Tüm task’lar'}, ...(log?.tasks ?? []).map(task => ({value: task.id, label: task.title}))]}/>
      </div>
    </div>

    <div className="table-scroll"><table>
      <thead><tr><th>Tarih</th><th>Kişi</th><th>İşlem</th><th>Task</th><th>Ayrıntı</th></tr></thead>
      <tbody>
        {(log?.rows ?? []).map(row => <tr key={row.id}>
          <td><time dateTime={row.createdAt}>{stamp.format(new Date(row.createdAt))}</time></td>
          <td>{row.actorName}</td>
          <td><span className={`log-action ${actions[row.action].tone}`}>{actions[row.action].icon} {actions[row.action].label}</span></td>
          <td><div className="project-cell"><strong>{row.taskTitle}</strong>
            {row.taskId === null && <small>Task silindi</small>}
          </div></td>
          <td>{row.detail ?? <span className="permission-summary">—</span>}</td>
        </tr>)}
        {!log?.rows.length && <tr><td colSpan={5} className="muted">
          {taskId ? 'Bu task için kayıt yok.' : 'Bu projede henüz kayıt yok.'}
        </td></tr>}
      </tbody>
    </table></div>

    <div className="permissions-foot">
      <ScrollText size={14}/> {log?.rows.length ?? 0} kayıt · eskiden yeniye sıralı.
    </div>
  </div>;
}
