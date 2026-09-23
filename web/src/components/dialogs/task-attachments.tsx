import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, File, Image, Paperclip, RefreshCw, Trash2, X } from 'lucide-react';
import { Button } from '../ui';
import type { Attachment, Task } from '../../lib/types';
import { apiBlob } from '../../api';
import { toast } from '../../lib/toast';

export const fileSize = (size: number) => size < 1024 * 1024 ? `${Math.ceil(size / 1024)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
export const previewable = (attachment: Attachment) => /^image\/(png|jpeg|gif|webp)$/.test(attachment.mimeType);

export function AttachmentDropZone({onFiles}: {onFiles: (files: File[]) => void}) {
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

export function AttachmentPicker({files, onChange}: {files: File[]; onChange: (files: File[]) => void}) {
  return <div className="field attachment-picker"><span>Dosyalar ve görseller</span>
    <AttachmentDropZone onFiles={selected => onChange([...files, ...selected])}/>
    {!!files.length && <div className="pending-files">{files.map((file, index) =>
      <span key={`${file.name}-${file.lastModified}-${index}`}><File size={13}/>{file.name}<small>{fileSize(file.size)}</small></span>)}</div>}
  </div>;
}

export function AttachmentImage({path, attachment, className}: {path: string; attachment: Attachment; className?: string}) {
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

export async function downloadAttachment(path: string, attachment: Attachment) {
  try {
    const url = URL.createObjectURL(await apiBlob(`${path}/${attachment.id}`));
    const link = document.createElement('a');
    link.href = url;
    link.download = attachment.name;
    link.click();
    toast('Dosya indirmesi başlatıldı.');
    setTimeout(() => URL.revokeObjectURL(url), 0);
  } catch (error) { toast((error as Error).message, 'error'); }
}

export function AttachmentPreview({path, attachment, onClose}: {path: string; attachment: Attachment; onClose: () => void}) {
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

export function Attachments({task, canUpdate, busy, onAdd, onReplace, onDelete}: {task: Task; canUpdate: boolean; busy: boolean;
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

