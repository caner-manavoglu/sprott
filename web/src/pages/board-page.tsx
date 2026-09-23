import { useLayoutEffect, useRef, useState } from 'react';
import { AlertTriangle, CalendarClock, Columns3, GitPullRequest, GripVertical, LayoutDashboard, Lock, Plus } from 'lucide-react';
import { TaskTypeBadge } from '../components/task-type';
import { Button } from '../components/ui';
import { PeopleFilter } from '../components/people-filter';
import { PriorityFilter, TaskPriorityBadge } from '../components/task-priority';
import { taskPriorities, type TaskPriority } from '../../../shared/task-priorities';
import { setParam, useSearch } from '../routes';
import { canMove, dateLabel, daysLate, fullName, isOverdue, taskCode } from '../lib/format';
import type { Board, Task, User } from '../lib/types';
import { Avatar } from '../components/avatar';

type Props = {
  board: Board;
  members: User[];
  busy: boolean;
  /** Proje tamamlandığında pano salt okunur olur; kayıtlar olduğu gibi kalır. */
  locked: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  /** Yöneticiler proje akışına takılmaz. */
  isAdmin: boolean;
  onAddTask: (columnId: number) => void;
  onOpenTask: (task: Task) => void;
  onMove: (taskId: number, columnId: number) => void;
};

/** Sütunlar yeniden sıralandığında kartların yeni yerine süzülmesini sağlar. */
function useColumnShuffle(columns: Board['columns']) {
  // Konum `offsetLeft` ile okunur: `getBoundingClientRect` süren animasyonun
  // transform'unu da içerdiği için ölçüm kendi animasyonundan etkilenirdi.
  const positions = useRef(new Map<number, number>());
  useLayoutEffect(() => {
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.querySelectorAll<HTMLElement>('[data-board-column]').forEach(node => {
      const id = Number(node.dataset.boardColumn);
      const left = node.offsetLeft;
      const before = positions.current.get(id);
      positions.current.set(id, left);
      const shift = before === undefined ? 0 : before - left;
      if (reduceMotion || Math.abs(shift) < 2) return;

      node.getAnimations().forEach(animation => animation.cancel());
      node.style.zIndex = '2';
      // Havalan → yeni yerine süzül → otur. Sürükleme sırasında sıra art arda
      // değiştiği için kısa tutulur; uzun animasyon yarıda kesilip zıplıyordu.
      const animation = node.animate([
        {transform: `translateX(${shift}px)`, boxShadow: '0 0 0 rgb(0 0 0 / 0)'},
        {transform: `translate(${shift * 0.5}px,-14px) scale(1.02)`, boxShadow: '0 18px 30px rgb(0 0 0 / .32)', offset: 0.5},
        {transform: 'translate(0,0) scale(1)', boxShadow: '0 0 0 rgb(0 0 0 / 0)'},
      ], {duration: 360, easing: 'cubic-bezier(.22,.61,.36,1)'});
      animation.finished.catch(() => {}).finally(() => {node.style.zIndex = '';});
    });
  }, [columns]);
}

export function BoardPage({board, members, busy, locked, canCreate, canUpdate, isAdmin, onAddTask, onOpenTask, onMove}: Props) {
  // Filtreler adres çubuğunda tutulur: bağlantı paylaşılabilir, sayfa yenilenince kaybolmaz.
  const params = new URLSearchParams(useSearch());
  const assigneeIds = (params.get('kisi')?.split(',') ?? [])
    .map(Number).filter(id => Number.isSafeInteger(id) && id > 0);
  const priorities = (params.get('oncelik')?.split(',') ?? [])
    .filter((value): value is TaskPriority => taskPriorities.includes(value as TaskPriority));
  const setAssigneeIds = (next: number[]) => setParam('kisi', next.join(','));
  const setPriorities = (next: TaskPriority[]) => setParam('oncelik', next.join(','));
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [draggedTask, setDraggedTask] = useState<number | null>(null);
  const [landedTask, setLandedTask] = useState<number | null>(null);
  useColumnShuffle(board.columns);

  // Kişi ve öncelik filtreleri birlikte çalışır; boş filtre "hepsi" demektir.
  const visibleTasks = board.tasks.filter(task =>
    (!assigneeIds.length || (task.assigneeId !== null && assigneeIds.includes(task.assigneeId)))
    && (!priorities.length || priorities.includes(task.priority)));

  const toggleAssignee = (id: number) =>
    setAssigneeIds(assigneeIds.includes(id) ? assigneeIds.filter(item => item !== id) : [...assigneeIds, id]);

  const togglePriority = (priority: TaskPriority) =>
    setPriorities(priorities.includes(priority) ? priorities.filter(item => item !== priority) : [...priorities, priority]);

  /** Sürüklenen task bu sütuna bırakılabilir mi; akış kuralı kapalıysa sütun pasif görünür. */
  const dropAllowed = (columnId: number) => {
    const task = board.tasks.find(item => item.id === draggedTask);
    return !task || canMove(board, isAdmin, task.columnId, columnId);
  };

  const dropTask = (event: React.DragEvent, columnId: number) => {
    event.preventDefault();
    setDragOver(null);
    const id = Number(event.dataTransfer.getData('text/plain'));
    const task = board.tasks.find(item => item.id === id);
    if (task && !canMove(board, isAdmin, task.columnId, columnId)) return;
    if (Number.isSafeInteger(id) && id > 0 && !busy && canUpdate) {
      setLandedTask(id);
      onMove(id, columnId);
    }
  };

  return <>
    <div className="board-toolbar">
      <div>
        <span className="view-tab"><LayoutDashboard size={15}/> Pano görünümü</span>
        <span className="task-total">{visibleTasks.length} task</span>
        <PeopleFilter members={members} selected={assigneeIds} onToggle={toggleAssignee} onClear={() => setAssigneeIds([])}/>
        <PriorityFilter selected={priorities} onToggle={togglePriority} onClear={() => setPriorities([])}/>
      </div>
      {locked
        ? <span className="board-hint locked"><Lock size={13}/> Proje tamamlandı · pano salt okunur</span>
        : <span className="board-hint"><GripVertical size={14}/> Sürükleyerek taşıyın</span>}
    </div>

    <div className="board-scroll" tabIndex={0} aria-label="Yatay kaydırılabilir task panosu">
      <div className="board-columns" style={{gridTemplateColumns: `repeat(${board.columns.length}, minmax(260px, 1fr))`}}>
        {board.columns.map((column, index) => {
          const tasks = visibleTasks.filter(task => task.columnId === column.id);
          return <section key={column.id} data-board-column={column.id}
            className={`kanban-column ${dragOver === column.id ? 'drag-over' : ''} ${draggedTask !== null && !dropAllowed(column.id) ? 'drop-blocked' : ''}`}
            onDragOver={event => {
              if (!dropAllowed(column.id)) return;
              event.preventDefault();
              setDragOver(column.id);
            }}
            onDragLeave={event => {if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(null);}}
            onDrop={event => dropTask(event, column.id)}>

            <header className="column-header">
              <span className={`column-dot tone-${index % 4}`}/>
              <h2>{column.name}</h2>
              <span className="column-count">{tasks.length}</span>
              {canCreate && <Button variant="ghost" size="icon" aria-label={`${column.name} sütununa task ekle`} onClick={() => onAddTask(column.id)}>
                <Plus size={16}/>
              </Button>}
            </header>

            <div className="column-body">
              {tasks.map(task => {
                const assignee = members.find(person => person.id === task.assigneeId);
                // Süresi geçen task kırmızı çerçeveyle işaretlenir; son sütundaki task tamamlanmış sayılır.
                const late = isOverdue(task, board.columns);
                const openPrCount = task.pullRequests.filter(pullRequest => pullRequest.state === 'open').length;
                return <button key={task.id}
                  className={`task-card ${late ? 'overdue' : ''} ${task.priority === 'highest' ? 'critical' : ''} ${draggedTask === task.id ? 'is-dragging' : ''} ${landedTask === task.id ? 'just-moved' : ''}`}
                  draggable={!busy && canUpdate}
                  onAnimationEnd={() => setLandedTask(null)}
                  onDragStart={event => {
                    event.dataTransfer.setData('text/plain', String(task.id));
                    event.dataTransfer.effectAllowed = 'move';
                    setDraggedTask(task.id);
                  }}
                  onDragEnd={() => {setDragOver(null); setDraggedTask(null);}}
                  onClick={() => onOpenTask(task)}>
                  <span className="task-code">{taskCode(task.id)}</span>
                  {task.parentTaskId && <span className="task-parent">↳ {taskCode(task.parentTaskId)} · {task.parentTitle}</span>}
                  <h3>{task.title}</h3>
                  <p>{task.description}</p>
                  {task.dueDate && <span className={`task-due ${late ? 'late' : ''}`}>
                    {late ? <AlertTriangle size={11}/> : <CalendarClock size={11}/>}
                    {dateLabel(task.dueDate)}{late && ` · ${daysLate(task.dueDate)} gün gecikme`}
                  </span>}
                  <div className="card-footer">
                    <TaskTypeBadge type={task.type}/>
                    <TaskPriorityBadge priority={task.priority}/>
                    {/* Yalnızca bekleyen PR'lar sayılır; onaylananlar rozeti düşürür. */}
                    {openPrCount > 0 && <span className="task-prs" title={`${openPrCount} açık pull request`}>
                      <GitPullRequest size={12}/>{openPrCount}
                    </span>}
                    {assignee && <span className="task-assignee"><Avatar person={assignee} className="assignee-avatar"/>{fullName(assignee)}</span>}
                  </div>
                </button>;
              })}

              {!tasks.length && <div className="empty-column">
                <div><Columns3 size={21}/></div>
                <strong>Henüz task yok</strong>
                <span>{canCreate ? 'İlk task’ı ekleyin veya buraya taşıyın.' : 'Task’ları bu sütuna taşıyabilirsiniz.'}</span>
              </div>}

              {canCreate && <button className="add-task" onClick={() => onAddTask(column.id)}><Plus size={15}/> Task ekle</button>}
            </div>
          </section>;
        })}
      </div>
    </div>

    <footer className="board-footer">
      <span>{board.columns.length} sütun · {visibleTasks.length} task</span>
      <span>Her iş, bir adım ileri.</span>
    </footer>
  </>;
}
