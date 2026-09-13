import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, AtSign, Check, ChevronDown, Download, File, Image, MessageSquare, Paperclip, Pencil, Plus, RefreshCw, Send, Trash2, X } from 'lucide-react';
import { Button, DatePicker, Input, Select, Textarea } from '../ui';
import { DialogActions, DialogShell } from './shell';
import { canMove, dateLabel, daysLate, fullName, isOverdue, isoDate, monthAgo, taskCode } from '../../lib/format';
import type { Attachment, Board, Task, TaskComment, User } from '../../lib/types';
import { TaskTypeBadge, taskTypeOptions } from '../task-type';
import { TaskPriorityBadge, taskPriorityOptions } from '../task-priority';
import { apiBlob } from '../../api';

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

const fileSize = (size: number) => size < 1024 * 1024 ? `${Math.ceil(size / 1024)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
const previewable = (attachment: Attachment) => /^image\/(png|jpeg|gif|webp)$/.test(attachment.mimeType);

function AttachmentDropZone({onFiles}: {onFiles: (files: File[]) => void}) {
  const [dragging, setDragging] = useState(false);
  return <label className="attachment-select" data-dragging={dragging}
      onDragEnter={event => {event.preventDefault(); setDragging(true);}}
      onDragOver={event => {event.preventDefault(); event.dataTransfer.dropEffect = 'copy';}}
      onDragLeave={event => {if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);}}
      onDrop={event => {
        event.preventDefault();
        setDragging(false);
        const dropped = Array.from(event.dataTransfer.files);
        if (dropped.length) onFiles(dropped);
      }}>
      <Paperclip size={17}/><span>Dosyaları sürükleyin veya seçmek için tıklayın</span>
      <input type="file" multiple onChange={event => {const selected = Array.from(event.target.files ?? []); if (selected.length) onFiles(selected); event.target.value = '';}}/>
    </label>;
}

function AttachmentPicker({files, onChange}: {files: File[]; onChange: (files: File[]) => void}) {
  return <div className="field attachment-picker"><span>Dosyalar ve görseller</span>
    <AttachmentDropZone onFiles={selected => onChange([...files, ...selected])}/>
    {!!files.length && <div className="pending-files">{files.map((file, index) =>
      <span key={`${file.name}-${file.lastModified}-${index}`}><File size={13}/>{file.name}<small>{fileSize(file.size)}</small></span>)}</div>}
  </div>;
}

function AttachmentImage({path, attachment, className}: {path: string; attachment: Attachment; className?: string}) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let url = '', active = true;
    void apiBlob(`${path}/${attachment.id}`).then(blob => {
      url = URL.createObjectURL(blob);
      if (active) setSrc(url); else URL.revokeObjectURL(url);
    }).catch(() => {});
    return () => {active = false; if (url) URL.revokeObjectURL(url);};
  }, [path, attachment.id]);
  return src ? <img className={className} src={src} alt={attachment.name}/> : <span className="attachment-loading"><Image size={18}/></span>;
}

async function downloadAttachment(path: string, attachment: Attachment) {
  try {
    const url = URL.createObjectURL(await apiBlob(`${path}/${attachment.id}`));
    const link = document.createElement('a');
    link.href = url;
    link.download = attachment.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  } catch (error) { alert((error as Error).message); }
}

function AttachmentPreview({path, attachment, onClose}: {path: string; attachment: Attachment; onClose: () => void}) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => {if (event.key === 'Escape') {event.preventDefault(); event.stopImmediatePropagation(); onClose();}};
    window.addEventListener('keydown', close, true);
    return () => window.removeEventListener('keydown', close, true);
  }, [onClose]);
  return createPortal(<div className="attachment-preview" role="dialog" aria-modal="true" aria-label={attachment.name} onMouseDown={onClose}>
    <div onMouseDown={event => event.stopPropagation()}>
      <div className="attachment-preview-bar"><span>{attachment.name}</span><div>
        <Button type="button" variant="outline" size="icon" aria-label="İndir" onClick={() => void downloadAttachment(path, attachment)}><Download size={16}/></Button>
        <Button type="button" variant="outline" size="icon" aria-label="Kapat" onClick={onClose}><X size={16}/></Button>
      </div></div>
      <AttachmentImage path={path} attachment={attachment}/>
    </div>
  </div>, document.body);
}

function Attachments({task, canUpdate, busy, onAdd, onReplace, onDelete}: {task: Task; canUpdate: boolean; busy: boolean;
  onAdd: (files: File[]) => void; onReplace: (id: number, file: File) => void; onDelete: (id: number) => void}) {
  const [preview, setPreview] = useState<Attachment | null>(null);
  const attachments = task.attachments ?? [];
  const path = `tasks/${task.id}/attachments`;
  return <div className="task-attachments"><div className="attachment-heading"><strong>Dosyalar</strong></div>
    {canUpdate && !busy && <AttachmentDropZone onFiles={onAdd}/>} 
    {!attachments.length ? <span className="attachment-empty">Henüz dosya eklenmemiş.</span> : <div className="attachment-grid">{attachments.map(attachment =>
      <div className="attachment-item" key={attachment.id}>
        {previewable(attachment)
          ? <button type="button" className="attachment-thumb" onClick={() => setPreview(attachment)}><AttachmentImage path={path} attachment={attachment}/></button>
          : <div className="attachment-file"><File size={22}/></div>}
        <div className="attachment-info"><span title={attachment.name}>{attachment.name}</span><small>{fileSize(attachment.size)}</small></div>
        <div className="attachment-actions">
          <Button type="button" variant="ghost" size="icon" aria-label={`${attachment.name} indir`} onClick={() => void downloadAttachment(path, attachment)}><Download size={14}/></Button>
          {canUpdate && <><label className="attachment-action" aria-label={`${attachment.name} güncelle`}><RefreshCw size={14}/><input type="file" disabled={busy}
            onChange={event => {const file = event.target.files?.[0]; if (file) onReplace(attachment.id, file); event.target.value = '';}}/></label>
            <Button type="button" variant="ghost" size="icon" disabled={busy} aria-label={`${attachment.name} sil`}
              onClick={() => onDelete(attachment.id)}><Trash2 size={14}/></Button></>}
        </div>
      </div>)}</div>}
    {preview && <AttachmentPreview path={path} attachment={preview} onClose={() => setPreview(null)}/>} 
  </div>;
}

const commentDate = new Intl.DateTimeFormat('tr-TR', {dateStyle: 'medium', timeStyle: 'short'});
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function MentionInput({value, members, onChange, placeholder}: {value: string; members: User[]; onChange: (value: string) => void; placeholder: string}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const suggestions = query === null ? [] : members.filter(person => fullName(person).toLocaleLowerCase('tr').includes(query.trim().toLocaleLowerCase('tr'))).slice(0, 8);
  const update = (next: string, cursor: number) => {
    onChange(next);
    const match = next.slice(0, cursor).match(/(?:^|\s)@([^@\n]*)$/);
    setQuery(match?.[1] ?? null);
  };
  const choose = (person: User) => {
    const cursor = input.current?.selectionStart ?? value.length;
    const match = value.slice(0, cursor).match(/@[^@\n]*$/);
    const start = match ? cursor - match[0].length : cursor;
    const next = `${value.slice(0, start)}@${fullName(person)} ${value.slice(cursor)}`;
    onChange(next);
    setQuery(null);
    requestAnimationFrame(() => {input.current?.focus(); input.current?.setSelectionRange(start + fullName(person).length + 2, start + fullName(person).length + 2);});
  };
  return <div className="mention-input">
    <Textarea ref={input} value={value} maxLength={5000} placeholder={placeholder}
      onChange={event => update(event.target.value, event.target.selectionStart)}
      onKeyUp={event => {if (event.key === '@') setQuery('');}}
      onBlur={() => setTimeout(() => setQuery(null), 100)}/>
    {!!suggestions.length && <div className="mention-suggestions">{suggestions.map(person =>
      <button type="button" key={person.id} onMouseDown={event => event.preventDefault()} onClick={() => choose(person)}>
        <span>{person.name.charAt(0)}{person.surname.charAt(0)}</span><div><strong>{fullName(person)}</strong><small>{person.title}</small></div>
      </button>)}</div>}
  </div>;
}

function mentionedIds(body: string, members: User[]) {
  return members.filter(person => new RegExp(`@${escapeRegex(fullName(person))}(?=$|[\\s.,!?;:])`).test(body)).map(person => person.id);
}

function CommentBody({comment}: {comment: TaskComment}) {
  const names = comment.mentions.map(mention => mention.name).sort((a, b) => b.length - a.length);
  if (!names.length) return <p>{comment.body}</p>;
  const parts = comment.body.split(new RegExp(`(@(?:${names.map(escapeRegex).join('|')}))`, 'g'));
  return <p>{parts.map((part, index) => part.startsWith('@') && names.includes(part.slice(1))
    ? <mark key={index}>{part}</mark> : part)}</p>;
}

/** Yorumun ekleri. Düzenleme modunda her ekin yanında kaldırma düğmesi çıkar. */
function CommentAttachments({taskId, comment, busy, onRemove}: {
  taskId: number; comment: TaskComment; busy?: boolean;
  onRemove?: (attachmentId: number) => void;
}) {
  const [preview, setPreview] = useState<Attachment | null>(null);
  if (!comment.attachments.length) return null;
  const path = `tasks/${taskId}/comments/${comment.id}/attachments`;
  return <div className="comment-attachments">{comment.attachments.map(attachment =>
    <div key={attachment.id}>
      {previewable(attachment)
        ? <button type="button" className="attachment-thumb" onClick={() => setPreview(attachment)}><AttachmentImage path={path} attachment={attachment}/></button>
        : <div className="attachment-file"><File size={20}/></div>}
      <button type="button" className="comment-download" title={attachment.name} onClick={() => void downloadAttachment(path, attachment)}>
        <span>{attachment.name}</span><Download size={12}/>
      </button>
      {onRemove && <Button type="button" variant="ghost" size="icon" className="comment-attachment-remove"
        disabled={busy} aria-label={`${attachment.name} dosyasını kaldır`}
        onClick={() => onRemove(attachment.id)}><X size={13}/></Button>}
    </div>)}
    {preview && <AttachmentPreview path={path} attachment={preview} onClose={() => setPreview(null)}/>} 
  </div>;
}

function CommentItem({taskId, comment, members, currentUser, busy, onUpdate, onDelete, onRemoveAttachment}: {taskId: number; comment: TaskComment; members: User[];
  currentUser: User; busy: boolean;
  onUpdate: (id: number, body: string, mentions: number[], files: File[]) => Promise<boolean>;
  onDelete: (id: number) => void;
  onRemoveAttachment: (commentId: number, attachmentId: number) => void}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(comment.body);
  // Düzenleme sırasında seçilen yeni dosyalar; kaydedilince mevcut eklere eklenir.
  const [files, setFiles] = useState<File[]>([]);
  const mine = comment.authorId === currentUser.id;
  const cancel = () => {setBody(comment.body); setFiles([]); setEditing(false);};
  return <article className="task-comment">
    <header><span className="comment-avatar">{comment.authorName.split(/\s+/).map(part => part[0]).slice(0, 2).join('')}</span>
      <div><strong>{comment.authorName}</strong><time dateTime={comment.createdAt}>{commentDate.format(new Date(comment.createdAt))}</time></div>
      {mine && !editing && <div className="comment-actions"><Button type="button" variant="ghost" size="icon" aria-label="Yorumu düzenle" onClick={() => setEditing(true)}><Pencil size={13}/></Button>
        <Button type="button" variant="ghost" size="icon" disabled={busy} aria-label="Yorumu sil" onClick={() => onDelete(comment.id)}><Trash2 size={13}/></Button></div>}
    </header>
    {editing ? <div className="comment-edit">
      <MentionInput value={body} members={members} onChange={setBody} placeholder="Yorumunuzu düzenleyin…"/>
      <AttachmentDropZone onFiles={selected => setFiles(current => [...current, ...selected])}/>
      {!!files.length && <div className="pending-files">{files.map((file, index) =>
        <span key={`${file.name}-${file.lastModified}-${index}`}>
          <File size={13}/>{file.name}<small>{fileSize(file.size)}</small>
          <button type="button" aria-label={`${file.name} seçimini kaldır`}
            onClick={() => setFiles(current => current.filter((_, item) => item !== index))}><X size={12}/></button>
        </span>)}</div>}
      <div>
        <Button type="button" variant="outline" size="sm" onClick={cancel}>Vazgeç</Button>
        <Button type="button" size="sm" disabled={busy || !body.trim()}
          onClick={() => void onUpdate(comment.id, body, mentionedIds(body, members), files).then(ok => {if (ok) {setFiles([]); setEditing(false);}})}>Kaydet</Button>
      </div>
    </div> : <CommentBody comment={comment}/>} 
    {comment.updatedAt !== comment.createdAt && <small className="comment-edited">Düzenlendi</small>}
    <CommentAttachments taskId={taskId} comment={comment} busy={busy}
      onRemove={editing ? attachmentId => onRemoveAttachment(comment.id, attachmentId) : undefined}/>
  </article>;
}

function Comments({task, members, currentUser, busy, onAdd, onUpdate, onDelete, onRemoveAttachment}: {task: Task; members: User[]; currentUser: User; busy: boolean;
  onAdd: (body: string, mentions: number[], files: File[]) => Promise<boolean>;
  onUpdate: (id: number, body: string, mentions: number[], files: File[]) => Promise<boolean>;
  onDelete: (id: number) => void;
  onRemoveAttachment: (commentId: number, attachmentId: number) => void}) {
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  // Yazma alanı varsayılan olarak kapalıdır; yorum gönderilince yeniden kapanır.
  const [open, setOpen] = useState(false);
  // Açılma animasyonu bitmeden taşma serbest bırakılırsa içerik "patlar"; bitince serbest kalır,
  // böylece @ önerileri kutunun dışına taşabilir.
  const [settled, setSettled] = useState(false);
  const toggle = (next: boolean) => {setOpen(next); setSettled(false);};
  const submit = async () => {
    if (!body.trim()) return;
    if (await onAdd(body, mentionedIds(body, members), files)) {
      setBody('');
      setFiles([]);
      toggle(false);
    }
  };
  return <section className="task-comments">
    <div className="comments-heading"><strong><MessageSquare size={15}/> Yorumlar</strong><span>{task.comments?.length ?? 0}</span></div>
    <div className="comment-list">{(task.comments ?? []).map(comment => <CommentItem key={comment.id} taskId={task.id} comment={comment}
      members={members} currentUser={currentUser} busy={busy} onUpdate={onUpdate} onDelete={onDelete}
      onRemoveAttachment={onRemoveAttachment}/>)}
      {!task.comments?.length && <p className="comment-empty">Henüz yorum yapılmamış.</p>}
    </div>
    <div className="comment-composer">
      <button type="button" className="composer-toggle" aria-expanded={open} onClick={() => toggle(!open)}>
        <AtSign size={14}/> Yorum yazın<ChevronDown size={14}/>
      </button>
      <div className="reveal composer-reveal" data-open={open} data-settled={settled}
        onTransitionEnd={event => {if (event.propertyName === 'grid-template-rows') setSettled(open);}}><div>
        <div className="composer-body">
          <MentionInput value={body} members={members} onChange={setBody} placeholder="Yorumunuzu yazın; birini etiketlemek için @ kullanın…"/>
          <AttachmentDropZone onFiles={selected => setFiles(current => [...current, ...selected])}/>
          {!!files.length && <div className="pending-files">{files.map((file, index) =>
            <span key={`${file.name}-${file.lastModified}-${index}`}><File size={13}/>{file.name}<small>{fileSize(file.size)}</small></span>)}</div>}
          <Button type="button" disabled={busy || !body.trim()} onClick={() => void submit()}>{busy ? 'Gönderiliyor…' : 'Yorum gönder'}<Send size={14}/></Button>
        </div>
      </div></div>
    </div>
  </section>;
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
export function TaskDetailDialog({task, board, members, currentUser, busy, error, canUpdate, canDelete, onClose, onSave, onMove, onDelete,
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

      <Comments task={task} members={members} currentUser={currentUser} busy={busy}
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
