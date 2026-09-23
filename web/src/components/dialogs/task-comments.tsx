import { useRef, useState } from 'react';
import { AtSign, ChevronDown, Download, File, MessageSquare, Pencil, Send, Trash2, X } from 'lucide-react';
import { Button, Textarea } from '../ui';
import { fullName } from '../../lib/format';
import type { Attachment, TaskComment, User } from '../../lib/types';
import { Avatar } from '../avatar';
import { AttachmentDropZone, AttachmentImage, AttachmentPreview, downloadAttachment, fileSize, previewable } from './task-attachments';

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
        <Avatar person={person}/><div><strong>{fullName(person)}</strong><small>{person.title}</small></div>
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
    <header><Avatar className="comment-avatar" person={{id: comment.authorId, name: comment.authorName, hasAvatar: comment.authorHasAvatar}}/>
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

/** Yorumlar task açıldığında ayrıca yüklenir; pano yanıtında taşınmaz. */
export function Comments({taskId, comments, members, currentUser, busy, onAdd, onUpdate, onDelete, onRemoveAttachment}: {taskId: number; comments: TaskComment[]; members: User[]; currentUser: User; busy: boolean;
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
    <div className="comments-heading"><strong><MessageSquare size={15}/> Yorumlar</strong><span>{comments.length}</span></div>
    <div className="comment-list">{comments.map(comment => <CommentItem key={comment.id} taskId={taskId} comment={comment}
      members={members} currentUser={currentUser} busy={busy} onUpdate={onUpdate} onDelete={onDelete}
      onRemoveAttachment={onRemoveAttachment}/>)}
      {!comments.length && <p className="comment-empty">Henüz yorum yapılmamış.</p>}
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

