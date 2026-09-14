import { CalendarClock, CheckCircle2, ListChecks } from 'lucide-react';
import { TaskTypeBadge } from '../components/task-type';
import { TaskPriorityBadge } from '../components/task-priority';
import { navigate, paths } from '../routes';
import { dateLabel, daysLate, taskCode } from '../lib/format';
import { isoDate } from '../../../shared/timezone';
import type { MyTask } from '../lib/types';

/**
 * Tüm projelerde kullanıcıya atanmış, tamamlanmamış task'lar.
 * Sıralama sunucuda yapılır (teslim tarihi yakın olan üstte); burada yalnızca gösterilir.
 */
export function MyTasksPage({tasks}: {tasks: MyTask[]}) {
  if (!tasks.length) {
    return <div className="empty-panel"><div><CheckCircle2 size={22}/></div><strong>Açık işiniz yok</strong>
      <span>Size bir task atandığında burada görünür.</span></div>;
  }

  const today = isoDate();
  const late = tasks.filter(task => task.dueDate && task.dueDate < today);

  return <div className="permissions-panel">
    <div className="permissions-heading">
      <div className="permission-icon"><ListChecks size={21}/></div>
      <div><h2>Bana atananlar</h2>
        <p>{tasks.length} açık task{late.length ? ` · ${late.length} tanesi gecikmiş` : ''}.</p></div>
    </div>

    <div className="my-task-list">
      {tasks.map(task => {
        const overdue = !!task.dueDate && task.dueDate < today;
        return <button key={task.id} type="button" className={`my-task${overdue ? ' late' : ''}`}
          onClick={() => navigate(paths.boardTask(task.projectId, task.id))}>
          <span className="my-task-main">
            <strong>{task.title}</strong>
            <small>{taskCode(task.id)} · {task.projectName} · {task.columnName}</small>
          </span>
          <span className="my-task-tags">
            <TaskTypeBadge type={task.type}/>
            <TaskPriorityBadge priority={task.priority}/>
            {task.dueDate && <span className={`my-task-date${overdue ? ' late' : ''}`}>
              <CalendarClock size={13}/> {dateLabel(task.dueDate)}{overdue ? ` · ${daysLate(task.dueDate)} gün` : ''}
            </span>}
          </span>
        </button>;
      })}
    </div>
  </div>;
}
