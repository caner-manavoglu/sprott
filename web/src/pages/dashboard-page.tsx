import { AlertTriangle, ArrowRight, CheckCircle2, CircleDot, FolderKanban, ListChecks, TimerReset } from 'lucide-react';
import { Button } from '../components/ui';
import { dateLabel } from '../lib/format';
import type { OverdueTask, SummaryProject } from '../lib/types';

export function dashboardStats(summary: SummaryProject[], overdue: OverdueTask[]) {
  const total = summary.reduce((sum, project) => sum + project.columns.reduce((count, column) => count + column.taskCount, 0), 0);
  const completed = summary.reduce((sum, project) => sum + (project.columns.at(-1)?.taskCount ?? 0), 0);
  const inProgress = summary.reduce((sum, project) => sum + project.columns.slice(1, -1).reduce((count, column) => count + column.taskCount, 0), 0);
  return {total, completed, inProgress, overdue: overdue.length, completion: total ? Math.round(completed / total * 100) : 0};
}

function Metric({icon, label, value, tone}: {icon: React.ReactNode; label: string; value: number; tone?: 'danger'}) {
  return <article className={`dashboard-metric${tone ? ` ${tone}` : ''}`}>
    <span className="dashboard-metric-icon">{icon}</span>
    <div><strong>{value}</strong><span>{label}</span></div>
  </article>;
}

/** Geciken işler ana akışı bozmadan sağ tarafta görünür; boş durumda da olumlu geri bildirim verir. */
function OverduePanel({tasks, onOpen}: {tasks: OverdueTask[]; onOpen: (projectId: number) => void}) {
  return <aside className={`dashboard-overdue${tasks.length ? ' has-late' : ''}`}>
    <header>
      <span className={`dashboard-overdue-icon${tasks.length ? ' late' : ''}`}>
        {tasks.length ? <AlertTriangle size={19}/> : <CheckCircle2 size={19}/>} 
      </span>
      <div><h2>{tasks.length ? 'Dikkat gerekenler' : 'Her şey yolunda'}</h2>
        <p>{tasks.length ? `${tasks.length} task teslim tarihini geçti.` : 'Süresi geçen task bulunmuyor.'}</p></div>
    </header>
    {tasks.length ? <div className="dashboard-overdue-list">{tasks.map(task =>
      <button key={task.id} type="button" onClick={() => onOpen(task.projectId)}>
        <span><strong>{task.title}</strong><small>{task.projectName} · {task.columnName}</small></span>
        <span className="dashboard-overdue-date"><b>{task.daysLate} gün</b><small>{dateLabel(task.dueDate)}</small></span>
      </button>)}
    </div> : <div className="dashboard-clear-state"><CheckCircle2 size={32}/><span>Takvim planına uygun ilerliyor.</span></div>}
  </aside>;
}

function ProjectCard({project, isAdmin, onOpen}: {project: SummaryProject; isAdmin: boolean; onOpen: (id: number) => void}) {
  const total = project.columns.reduce((sum, column) => sum + column.taskCount, 0);
  const completed = project.columns.at(-1)?.taskCount ?? 0;
  const completion = total ? Math.round(completed / total * 100) : 0;

  return <article className="dashboard-project-card">
    <header>
      <span className="dashboard-project-icon"><FolderKanban size={18}/></span>
      <div><h3>{project.name}</h3><p>{project.columns.length} aşama · {isAdmin ? `${total} task` : `size atanan ${total} task`}</p></div>
      <Button variant="ghost" size="icon" aria-label={`${project.name} panosuna git`} title="Panoya git" onClick={() => onOpen(project.id)}><ArrowRight size={17}/></Button>
    </header>

    <div className="dashboard-project-progress">
      <div><span>İlerleme</span><strong>%{completion}</strong></div>
      <progress max={Math.max(total, 1)} value={completed} aria-label={`${project.name} tamamlanma oranı yüzde ${completion}`}/>
    </div>

    <div className="dashboard-column-list">{project.columns.map((column, index) =>
      <div className="dashboard-column-row" key={column.id}>
        <span className={`dashboard-column-dot${index === project.columns.length - 1 ? ' done' : ''}`}/>
        <div>
          <span><strong>{column.name}</strong><b>{column.taskCount}</b></span>
          <progress className={index === project.columns.length - 1 ? 'done' : ''} max={Math.max(total, 1)} value={column.taskCount} aria-label={`${column.name}: ${column.taskCount} task`}/>
          {!isAdmin && !!column.tasks.length && <div className="dashboard-task-tags">{column.tasks.map(task => <span key={task.id}>{task.title}</span>)}</div>}
        </div>
      </div>)}
    </div>

    <footer><span><CheckCircle2 size={14}/>{completed} tamamlandı</span><Button variant="outline" size="sm" onClick={() => onOpen(project.id)}>Panoya git <ArrowRight size={14}/></Button></footer>
  </article>;
}

/** Yönetici tüm task’ları, personel yalnızca kendine atanmış task’ları görür. */
export function DashboardPage({summary, overdue, isAdmin, onOpen}: {summary: SummaryProject[]; overdue: OverdueTask[]; isAdmin: boolean; onOpen: (projectId: number) => void}) {
  if (!summary.length) {
    return <div className="empty-panel"><div><FolderKanban size={22}/></div><strong>Henüz proje yok</strong>
      <span>{isAdmin ? 'Projeler sayfasından ilk projeyi oluşturun.' : 'Bir projeye eklendiğinizde burada görünecek.'}</span></div>;
  }

  const stats = dashboardStats(summary, overdue);
  return <div className="dashboard">
    <section className="dashboard-overview">
      <div className="dashboard-overview-copy">
        <span className="dashboard-kicker"><CircleDot size={13}/> CANLI DURUM</span>
        <h2>İşlerin genel görünümü</h2>
        <p>{isAdmin ? 'Tüm projelerdeki iş yükü ve ilerleme.' : 'Size atanan işlerin proje bazlı ilerlemesi.'}</p>
        <div className="dashboard-metrics">
          <Metric icon={<FolderKanban size={18}/>} label="Aktif proje" value={summary.length}/>
          <Metric icon={<ListChecks size={18}/>} label={isAdmin ? 'Toplam task' : 'Atanan task'} value={stats.total}/>
          <Metric icon={<TimerReset size={18}/>} label="Devam eden" value={stats.inProgress}/>
          <Metric icon={<AlertTriangle size={18}/>} label="Süresi geçen" value={stats.overdue} tone={stats.overdue ? 'danger' : undefined}/>
        </div>
      </div>
      <div className="dashboard-completion">
        <div className="dashboard-donut" style={{'--completion': `${stats.completion * 3.6}deg`} as React.CSSProperties}
          role="img" aria-label={`Genel tamamlanma oranı yüzde ${stats.completion}`}>
          <span><strong>%{stats.completion}</strong><small>tamamlandı</small></span>
        </div>
        <div><strong>{stats.completed} / {stats.total}</strong><span>Task tamamlandı</span></div>
      </div>
    </section>

    <div className="dashboard-content">
      <section className="dashboard-projects">
        <div className="dashboard-section-heading"><div><h2>Projeler</h2><p>İş yükünü ve aşama dağılımını karşılaştırın.</p></div><span>{summary.length} proje</span></div>
        <div className="dashboard-project-grid">{summary.map(project => <ProjectCard key={project.id} project={project} isAdmin={isAdmin} onOpen={onOpen}/>)}</div>
      </section>
      <OverduePanel tasks={overdue} onOpen={onOpen}/>
    </div>
  </div>;
}
