import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, DatePicker, Input, Select, Textarea } from '../ui';
import { DialogActions, DialogShell } from './shell';
import { canMove, dateLabel, daysLate, fullName, isOverdue, isoDate, monthAgo, taskCode } from '../../lib/format';
import type { Board, Task, TaskComment, User } from '../../lib/types';
import { TaskTypeBadge, taskTypeOptions } from '../task-type';
import { TaskPriorityBadge, taskPriorityOptions } from '../task-priority';
import { PrStateBadge } from '../pull-request';
import { AttachmentPicker, Attachments } from './task-attachments';
import { Comments } from './task-comments';

type NewTaskProps = {
  open: boolean;
  board: Board;
  members: User[];
  columnId: number;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (values: {type: Task['type']; priority: Task['priority']; parentTaskId: number | null; title: string; description: string; columnId: number; assigneeId: number | null; startDate: string; dueDate: string}, files: File[]) => void;
};

const assigneeOptions = (members: User[]) =>
  [{value: 0, label: 'Atanmamış'}, ...members.map(person => ({value: person.id, label: fullName(person)}))];
const parentOptions = (board: Board, currentId?: number) => board.tasks
  .filter(task => task.type !== 'subtask' && task.id !== currentId)
  .map(task => ({value: task.id, label: `${taskCode(task.id)} · ${task.title}`}));

/**
 * Başlangıç ve bitiş tarihi. Başlangıç bugünden en fazla bir ay geriye alınabilir;
 * bitişin üst sınırı yoktur, yalnızca başlangıçtan önce olamaz ve boş bırakılabilir.
 * Aynı kurallar sunucuda da işler.
 */
function TaskDates({start, due, onStart, onDue}: {start: string; due: string; onStart: (value: string) => void; onDue: (value: string) => void}) {
  // Kaydedilmiş başlangıç bir aydan eskiyse alt sınır o tarihe iner; aksi halde kayıt düzenlenemez olurdu.
  const earliest = start && start < monthAgo() ? start : monthAgo();
  return <div className="field-row">
    <div className="field"><span>Başlangıç tarihi</span>
      <DatePicker name="startDate" value={start} onChange={onStart} min={earliest} ariaLabel="Başlangıç tarihi"/>
    </div>
    <div className="field"><span>Bitiş tarihi</span>
      <DatePicker name="dueDate" value={due} onChange={onDue} min={start || earliest} clearable
        placeholder="Tarih yok (isteğe bağlı)" ariaLabel="Bitiş tarihi"/>
    </div>
  </div>;
}

export function NewTaskDialog({open, board, members, columnId, busy, error, onClose, onSubmit}: NewTaskProps) {
  const [start, setStart] = useState(isoDate());
  const [due, setDue] = useState('');
  const [type, setType] = useState<Task['type']>('task');
  const [files, setFiles] = useState<File[]>([]);
  // Modal her açılışta bugünle, boş bitiş tarihiyle ve orta öncelikle başlar.
  useEffect(() => {if (open) {setStart(isoDate()); setDue(''); setType('task'); setFiles([]);}}, [open]);

  return <DialogShell open={open} busy={busy} error={error} onClose={onClose}
    title="Yeni task" description="Task adını, açıklamasını ve tarihlerini ekleyin.">
    <form key={String(open)} onSubmit={event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      onSubmit({
        type: String(form.get('type')) as Task['type'],
        priority: String(form.get('priority')) as Task['priority'],
        parentTaskId: type === 'subtask' ? Number(form.get('parentTaskId')) || null : null,
        title: String(form.get('title')),
        description: String(form.get('description')),
        columnId: Number(form.get('columnId')),
        assigneeId: Number(form.get('assigneeId')) || null,
        startDate: start,
        dueDate: due,
      }, files);
    }}>
      <label>Task türü<Select name="type" value={type} onValueChange={value => setType(value as Task['type'])} options={taskTypeOptions}/></label>
      <label>Öncelik<Select name="priority" defaultValue="normal" options={taskPriorityOptions}/></label>
      <div className="reveal parent-reveal" data-open={type === 'subtask'} aria-hidden={type !== 'subtask'} inert={type !== 'subtask'}><div>
        <label>Ana task<Select name="parentTaskId" placeholder="Bağlanacağı taskı seçin" options={parentOptions(board)}/></label>
      </div></div>
      <label>Task adı<Input name="title" placeholder="Ne yapılması gerekiyor?" maxLength={160} required autoFocus/></label>
      <label>Açıklama<Textarea name="description" placeholder="Task’ın detaylarını yazın…" maxLength={5000} required/></label>
      <AttachmentPicker files={files} onChange={setFiles}/>
      <TaskDates start={start} due={due} onStart={setStart} onDue={setDue}/>
      <label>Atanan kişi<Select name="assigneeId" defaultValue="0" placeholder="Atanmamış" options={assigneeOptions(members)}/></label>
      <label>Sütun<Select name="columnId" defaultValue={String(columnId)} placeholder="Sütun seçin"
        options={board.columns.map(column => ({value: column.id, label: column.name}))}/></label>
      <DialogActions busy={busy} onCancel={onClose}>
        <Button disabled={busy}>{busy ? 'Kaydediliyor…' : 'Task oluştur'}<Plus size={15}/></Button>
      </DialogActions>
    </form>
  </DialogShell>;
}

type DetailProps = {
  task: Task | null;
  comments: TaskComment[];
  board: Board;
  members: User[];
  currentUser: User;
  busy: boolean;
  error: string;
  canUpdate: boolean;
  canDelete: boolean;
  onClose: () => void;
  onSave: (values: {type: Task['type']; priority: Task['priority']; parentTaskId: number | null; title: string; description: string; assigneeId: number | null; startDate: string; dueDate: string}) => void;
  onMove: (columnId: number) => void;
  onDelete: () => void;
  onAddAttachments: (files: File[]) => void;
  onReplaceAttachment: (id: number, file: File) => void;
  onDeleteAttachment: (id: number) => void;
  onAddComment: (body: string, mentions: number[], files: File[]) => Promise<boolean>;
  onUpdateComment: (id: number, body: string, mentions: number[], files: File[]) => Promise<boolean>;
  onRemoveCommentAttachment: (commentId: number, attachmentId: number) => void;
  onDeleteComment: (id: number) => void;
};

/** Task ayrıntısı: okuma görünümü, düzenleme formu ve silme onayı aynı modalda. */
export function TaskDetailDialog({task, comments, board, members, currentUser, busy, error, canUpdate, canDelete, onClose, onSave, onMove, onDelete,
  onAddAttachments, onReplaceAttachment, onDeleteAttachment, onAddComment, onUpdateComment, onDeleteComment, onRemoveCommentAttachment}: DetailProps) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [start, setStart] = useState('');
  const [due, setDue] = useState('');
  const [type, setType] = useState<Task['type']>('task');

  useEffect(() => {if (!task) {setEditing(false); setConfirmDelete(false);}}, [task]);
  useEffect(() => {
    setStart(task?.startDate ?? isoDate());
    setDue(task?.dueDate ?? '');
    setType(task?.type ?? 'task');
  }, [task?.id, editing]);

  const assignee = members.find(person => person.id === task?.assigneeId);
  const late = task ? isOverdue(task, board.columns) : false;
  const children = task ? board.tasks.filter(item => item.parentTaskId === task.id) : [];

  return <DialogShell open={task !== null} busy={busy} error={error} onClose={onClose}
    title={task ? taskCode(task.id) : ''} description="Task ayrıntılarını düzenleyin veya sütununu değiştirin.">
    {task && <div className="task-detail">
      <div className="reveal" data-open={!editing}><div>
        <h2>{task.title}</h2>
        <TaskTypeBadge type={task.type}/>
        {task.parentTaskId && <p className="task-relation">Ana task: {taskCode(task.parentTaskId)} · {task.parentTitle}</p>}
        <p>{task.description}</p>
        {/* Raporlayan task açılırken belirlenir ve düzenleme formunda yer almaz; değiştirilemez. */}
        <p className="assignee-line">Raporlayan: {task.createdByName ?? 'Bilinmiyor'}</p>
        <p className="assignee-line">{assignee ? `Atanan: ${fullName(assignee)}` : 'Bu task kimseye atanmamış.'}</p>
        <p className="priority-line">Öncelik: <TaskPriorityBadge priority={task.priority}/></p>
        <div className="task-dates">
          <span>{task.startDate ? `Başlangıç: ${dateLabel(task.startDate)}` : 'Başlangıç tarihi yok'}</span>
          <span className={late ? 'late' : undefined}>
            {late && <AlertTriangle size={13}/>}
            {task.dueDate ? `Bitiş: ${dateLabel(task.dueDate)}` : 'Bitiş tarihi yok'}
            {late && ` · ${daysLate(task.dueDate!)} gün gecikme`}
          </span>
        </div>
        {!!children.length && <div className="subtask-list"><strong>Alt tasklar</strong>{children.map(child =>
          <div key={child.id}><TaskTypeBadge type={child.type}/><span>{taskCode(child.id)} · {child.title}</span></div>)}</div>}
        {/* Bağlı PR'lar salt okunurdur; ekleme ve düzenleme PR ekranından yapılır. */}
        {!!task.pullRequests.length && <div className="subtask-list"><strong>Bağlı PR’lar</strong>{task.pullRequests.map(pullRequest =>
          <div key={pullRequest.id}><PrStateBadge state={pullRequest.state}/>
            <a href={pullRequest.url} target="_blank" rel="noreferrer noopener">{pullRequest.title}</a></div>)}</div>}
      </div></div>

      <div className="reveal" data-open={editing}><div>{canUpdate && <form id="task-edit-form" key={`${task.id}-${editing}`} onSubmit={event => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        onSave({
          type: String(form.get('type')) as Task['type'],
          priority: String(form.get('priority')) as Task['priority'],
          parentTaskId: type === 'subtask' ? Number(form.get('parentTaskId')) || null : null,
          title: String(form.get('title')),
          description: String(form.get('description')),
          assigneeId: Number(form.get('assigneeId')) || null,
          startDate: start,
          dueDate: due,
        });
        setEditing(false);
      }}>
        <label>Task türü<Select name="type" value={type} onValueChange={value => setType(value as Task['type'])} options={taskTypeOptions}/></label>
        <label>Öncelik<Select name="priority" defaultValue={task.priority} options={taskPriorityOptions}/></label>
        <div className="reveal parent-reveal" data-open={type === 'subtask'} aria-hidden={type !== 'subtask'} inert={type !== 'subtask'}><div>
          <label>Ana task<Select name="parentTaskId" defaultValue={String(task.parentTaskId ?? '')}
            placeholder="Bağlanacağı taskı seçin" options={parentOptions(board, task.id)}/></label>
        </div></div>
        <label>Task adı<Input name="title" defaultValue={task.title} maxLength={160} required/></label>
        <label>Açıklama<Textarea name="description" defaultValue={task.description} maxLength={5000} required rows={5}/></label>
        <TaskDates start={start} due={due} onStart={setStart} onDue={setDue}/>
        <label>Atanan kişi<Select name="assigneeId" defaultValue={String(task.assigneeId ?? 0)} placeholder="Atanmamış" options={assigneeOptions(members)}/></label>
      </form>}</div></div>

      {/* Akış kuralı kapalı olan hedefler listede görünmez; yöneticilerde tüm sütunlar kalır. */}
      <label>Sütuna taşı<Select disabled={busy || !canUpdate} value={String(task.columnId)}
        onValueChange={value => onMove(Number(value))}
        options={board.columns
          .filter(column => canMove(board, currentUser.role === 'admin', task.columnId, column.id))
          .map(column => ({value: column.id, label: column.name}))}/></label>

      <Attachments task={task} canUpdate={canUpdate} busy={busy} onAdd={onAddAttachments}
        onReplace={onReplaceAttachment} onDelete={onDeleteAttachment}/>

      <Comments taskId={task.id} comments={comments} members={members} currentUser={currentUser} busy={busy}
        onAdd={onAddComment} onUpdate={onUpdateComment} onDelete={onDeleteComment}
        onRemoveAttachment={onRemoveCommentAttachment}/>

      {!canUpdate && <p className="muted text-xs">Task güncelleme yetkiniz bulunmuyor.</p>}

      {confirmDelete
        ? <div className="form-actions">
            <span className="confirm-text">Bu task’ı silmek istediğinize emin misiniz?</span>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirmDelete(false)}>Vazgeç</Button>
            <Button type="button" variant="destructive" disabled={busy} onClick={onDelete}>
              {busy ? 'Siliniyor…' : 'Evet, sil'}<Trash2 size={15}/>
            </Button>
          </div>
        : editing
          ? <div className="task-detail-actions">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(false)}>Vazgeç</Button>
            <div className="task-detail-primary">
              <Button key="save" type="submit" form="task-edit-form" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Değişiklikleri kaydet'}<Check size={15}/></Button>
              {canDelete && <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirmDelete(true)}>
                <Trash2 size={15}/> Task’ı sil
              </Button>}
            </div>
          </div>
          : (canUpdate || canDelete) && <div className="task-detail-actions">
            {canDelete ? <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirmDelete(true)}>
              <Trash2 size={15}/> Task’ı sil
            </Button> : <span/>}
            <div className="task-detail-primary">{canUpdate && <Button key="edit" type="button" variant="outline" disabled={busy} onClick={event => {event.preventDefault(); setEditing(true);}}>
              <Pencil size={15}/> Düzenle
            </Button>}</div>
          </div>}
    </div>}
  </DialogShell>;
}
