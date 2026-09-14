import { useEffect, useState } from 'react';
import { Download, MessageCircle } from 'lucide-react';
import { apiBlob } from '../api';
import { useAsync } from '../lib/use-async';
import type { Attachment } from '../lib/types';

export function ForumPortrait({forum}: {forum: {id: number; name: string; hasImage: boolean; imageVersion: number}}) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let cancelled = false, objectUrl = '';
    setUrl('');
    if (forum.hasImage) void apiBlob(`forums/${forum.id}/image?v=${forum.imageVersion}`).then(blob => {
      if (!cancelled) {objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);}
    }).catch(() => {});
    return () => {cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl);};
  }, [forum.id,forum.hasImage,forum.imageVersion]);
  return <span className="forum-portrait" aria-hidden="true">{url ? <img src={url} alt=""/> : <MessageCircle size={22}/>}</span>;
}

export function ForumImagePicker() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!file) {setPreview(''); return;}
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <label className="forum-image-picker">Forum görseli
    {preview && <img src={preview} alt="Seçilen forum görseli"/>}
    <input name="image" type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={event => {
      const next = event.target.files?.[0] ?? null;
      if (next && (next.size > 5 * 1024 * 1024 || !['image/png','image/jpeg','image/gif','image/webp'].includes(next.type))) {
        event.target.value = ''; setFile(null); setError('JPG, PNG, GIF veya WebP seçin; en fazla 5 MB.'); return;
      }
      setError(''); setFile(next);
    }}/>
    <small>{error || file?.name || 'İsteğe bağlı · JPG, PNG, GIF, WebP · en fazla 5 MB'}</small>
  </label>;
}

export function ForumFile({forumId, file}: {forumId: number; file: Attachment}) {
  const [url, setUrl] = useState('');
  const {busy, error, run} = useAsync();
  const isImage = ['image/png','image/jpeg','image/gif','image/webp'].includes(file.mimeType);
  useEffect(() => {
    if (!isImage) return;
    let cancelled = false, objectUrl = '';
    void apiBlob(`forums/${forumId}/files/${file.id}`).then(blob => {
      if (!cancelled) {objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);}
    }).catch(() => {});
    return () => {cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl);};
  }, [forumId,file.id,isImage]);
  return <div className="forum-file">
    {url && <a href={url} target="_blank" rel="noreferrer" aria-label={`${file.name} görselini büyüt`}><img src={url} alt={file.name}/></a>}
    <button disabled={busy} onClick={() => void run(async () => {
      const blob = await apiBlob(`forums/${forumId}/files/${file.id}`), href = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = href; link.download = file.name; link.click();
      setTimeout(() => URL.revokeObjectURL(href),1000);
    })}><Download size={14}/>{busy ? 'İndiriliyor…' : file.name}<small>{Math.ceil(file.size / 1024)} KB</small></button>
    {error && <small role="alert">{error}</small>}
  </div>;
}
