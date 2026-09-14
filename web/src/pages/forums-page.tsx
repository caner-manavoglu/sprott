import { useEffect, useRef, useState } from 'react';
import { Check, CheckCheck, Clock, ImagePlus, MessageCircle, Paperclip, Pencil, Plus, Send, Trash2, UserPlus, Users } from 'lucide-react';
import { api, fileBody } from '../api';
import { Avatar } from '../components/avatar';
import { ForumFile, ForumImagePicker, ForumPortrait } from '../components/forum-media';
import { Button, Input, Textarea } from '../components/ui';
import { DialogShell } from '../components/dialogs/shell';
import { allowed, fullName } from '../lib/format';
import { subscribeLive } from '../lib/live';
import { useAsync } from '../lib/use-async';
import type { Attachment, User } from '../lib/types';

type Forum = {id: number; name: string; description: string; status: 'pending' | 'joined' | null; memberCount: number; requestCount: number; hasImage: boolean; imageVersion: number};
type Person = User & {status: 'pending' | 'joined' | null};
type Receipt = Pick<User,'id' | 'name' | 'surname' | 'hasAvatar'> & {deliveredAt: string | null; readAt: string | null};
type Message = {id: number; body: string; authorId: number | null; name: string; surname: string; hasAvatar: boolean; createdAt: string; editedAt: string | null; deletedAt: string | null; hidden: boolean; myReadAt: string | null; isRecipient: boolean; files: Attachment[]; receipts: {total: number; delivered: number; read: number} | null};
const dateTime = (value: string) => new Date(value).toLocaleString('tr-TR');

export function ForumsPage({user}: {user: User}) {
  const [forums, setForums] = useState<Forum[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [draft, setDraft] = useState<Forum | 'new' | null>(null);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [deleting, setDeleting] = useState<Forum | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [deleteMessage, setDeleteMessage] = useState<Message | null>(null);
  const [receiptMessage, setReceiptMessage] = useState<number | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const {busy, error, setError, run} = useAsync();
  const input = useRef<HTMLInputElement>(null);
  const composer = useRef<HTMLFormElement>(null);
  const messageArea = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const oldest = useRef<number | null>(null);
  const sending = useRef(false);
  const syncNow = useRef<() => Promise<void>>(async () => {});
  const peopleOpen = people !== null;
  const forum = forums.find(item => item.id === selected);
  const joined = !!forum && (user.role === 'admin' || forum.status === 'joined');
  const canView = allowed(user,'forum.view');
  const refresh = async () => {setForums(await api<Forum[]>('forums'));};
  const choose = (id: number) => {
    if (id === selected) return;
    oldest.current = null; nearBottom.current = true; setMessages([]); setHasOlder(false);
    setSelected(id); setPeople(null); setReceiptMessage(null); setBody(''); setFiles([]);
    if (input.current) input.current.value = '';
  };

  useEffect(() => {
    if (!canView) {setLoading(false); return;}
    let cancelled = false, pending = false, again = false;
    const sync = async () => {
      if (pending) {again = true; return;}
      pending = true;
      try {
        do {
          again = false;
          const list = await api<Forum[]>('forums');
          if (cancelled) return;
          setForums(list);
          const current = list.find(item => item.id === selected);
          if (current && (user.role === 'admin' || current.status === 'joined')) {
            // ponytail: yüklenmiş geçmiş sayfaları tazelenir; yoğun sohbetlerde mesaj değişikliklerini SSE ile ayrı taşıyın.
            let page = await api<Message[]>('forums/' + selected + '/messages');
            let next = page;
            while (!cancelled && page.length === 50 && oldest.current !== null && page[0].id > oldest.current) {
              page = await api<Message[]>('forums/' + selected + '/messages?before=' + page[0].id);
              next = [...page,...next];
            }
            if (cancelled) return;
            oldest.current = next[0]?.id ?? null;
            setMessages(next); setHasOlder(page.length === 50);
            if (peopleOpen && user.role === 'admin') {
              const nextPeople = await api<Person[]>('forums/' + selected + '/people');
              if (!cancelled) setPeople(nextPeople);
            }
            if (receiptMessage !== null) {
              const nextReceipts = await api<Receipt[]>('forums/' + selected + '/messages/' + receiptMessage + '/receipts');
              if (!cancelled) setReceipts(nextReceipts);
            }
          } else {setMessages([]); setHasOlder(false); setPeople(null); setReceiptMessage(null);}
        } while (again && !cancelled);
      } catch (err) {if (!cancelled) {setMessages([]); setError((err as Error).message);}}
      finally {pending = false; if (!cancelled) setLoading(false);}
    };
    syncNow.current = sync;
    setLoading(true);
    const unsubscribe = subscribeLive(() => {void sync();});
    void sync();
    return () => {cancelled = true; unsubscribe();};
  }, [selected, user.id, user.role, canView, peopleOpen, receiptMessage]);

  useEffect(() => {
    const area = messageArea.current;
    if (area && nearBottom.current) area.scrollTop = area.scrollHeight;
  }, [messages.at(-1)?.id, selected]);

  useEffect(() => {
    const area = messageArea.current;
    if (!area || !joined || peopleOpen || receiptMessage !== null || editing || deleteMessage || draft || deleting) return;
    let stopped = false, timer: ReturnType<typeof setTimeout> | undefined;
    const visible = new Set<number>(), sent = new Set<number>();
    const flush = async () => {
      if (stopped || document.visibilityState !== 'visible' || !document.hasFocus()) return;
      const ids = [...visible].filter(id => {
        const rect = area.querySelector<HTMLElement>('[data-message-id="' + id + '"]')?.getBoundingClientRect();
        return !sent.has(id) && rect && rect.bottom > 0 && rect.top < window.innerHeight;
      }).slice(0,500);
      if (!ids.length) return;
      ids.forEach(id => sent.add(id));
      try {await api('forums/receipts','POST',{ids,kind:'read'});}
      catch {ids.forEach(id => sent.delete(id));}
    };
    const schedule = () => {clearTimeout(timer); timer = setTimeout(() => {void flush();},200);};
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const id = Number((entry.target as HTMLElement).dataset.messageId);
        if (entry.isIntersecting) visible.add(id); else visible.delete(id);
      });
      schedule();
    }, {root: area, threshold: 0.1});
    area.querySelectorAll('[data-unread="true"]').forEach(node => observer.observe(node));
    window.addEventListener('focus',schedule);
    window.addEventListener('scroll',schedule,true);
    document.addEventListener('visibilitychange',schedule);
    return () => {stopped = true; clearTimeout(timer); observer.disconnect(); window.removeEventListener('focus',schedule); window.removeEventListener('scroll',schedule,true); document.removeEventListener('visibilitychange',schedule);};
  }, [messages, joined, peopleOpen, receiptMessage, editing, deleteMessage, draft, deleting]);

  if (!canView) return <p className="muted">Forum görüntüleme yetkiniz bulunmuyor.</p>;
  const manage = async (person: Person, method: string) => {
    await api('forums/' + selected + '/members/' + person.id,method);
    setPeople(await api<Person[]>('forums/' + selected + '/people')); await refresh();
  };
  const removeMessage = (scope: 'me' | 'everyone') => void run(async () => {
    await api('forums/' + selected + '/messages/' + deleteMessage!.id + '?scope=' + scope,'DELETE');
    setDeleteMessage(null); await syncNow.current();
  });

  return <>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="forum-layout">
      <section className="forum-directory">
        <header><h2><span className="forum-heading-icon"><MessageCircle size={19}/></span>Forumlar</h2>{allowed(user,'forum.create') && <Button size="sm" onClick={() => setDraft('new')}><Plus size={15}/> Oluştur</Button>}</header>
        {forums.map(item => <div className={'forum-card' + (selected === item.id ? ' active' : '')} key={item.id}>
          <button className="forum-select" disabled={busy} onClick={() => choose(item.id)}>
            <ForumPortrait forum={item}/>
            <span className="forum-card-info"><strong>{item.name}</strong><small>{item.description || 'Ekip sohbeti ve toplantı notları'}</small><small>{item.memberCount} üye{item.requestCount > 0 ? ' · ' + item.requestCount + ' istek' : ''}</small></span>
          </button>
          <div className="forum-actions">
            {item.status === 'pending' && <span className="forum-pending"><Clock size={13}/> Onay bekleniyor</span>}
            {allowed(user,'forum.update') && <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDraft(item)}><Pencil size={13}/> Düzenle</Button>}
            {allowed(user,'forum.delete') && <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDeleting(item)}><Trash2 size={13}/> Sil</Button>}
          </div>
        </div>)}
        {!forums.length && <p className="muted">{loading ? 'Forumlar yükleniyor…' : 'Henüz forum oluşturulmadı.'}</p>}
      </section>
      <section className="forum-chat">
        {forum ? <>
          <header><div className="forum-chat-heading"><ForumPortrait forum={forum}/><div><h2>{forum.name}</h2><p>{forum.description || forum.memberCount + ' üye'}</p></div></div>
            {user.role === 'admin' && <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => setPeople(await api<Person[]>('forums/' + selected + '/people')))}><Users size={16}/> Üyeler / İstekler{!!forum.requestCount && <span className="forum-request-badge" aria-label={forum.requestCount + ' bekleyen istek'}>{forum.requestCount}</span>}</Button>}
          </header>
          {joined ? <>
            <div className="forum-messages" ref={messageArea} role="log" aria-label="Forum mesajları" onScroll={event => {const area = event.currentTarget; nearBottom.current = area.scrollHeight - area.scrollTop - area.clientHeight < 100;}}>
              {hasOlder && !!messages.length && <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => {
                const older = await api<Message[]>('forums/' + selected + '/messages?before=' + messages[0].id);
                oldest.current = older[0]?.id ?? messages[0].id;
                nearBottom.current = false;
                const area = messageArea.current, height = area?.scrollHeight ?? 0, top = area?.scrollTop ?? 0;
                setMessages(current => [...older.filter(item => !current.some(message => message.id === item.id)),...current]); setHasOlder(older.length === 50);
                requestAnimationFrame(() => {if (area) area.scrollTop = top + area.scrollHeight - height;});
              })}>Önceki mesajlar</Button>}
              {!messages.some(message => !message.hidden) && <p className="muted">{loading ? 'Mesajlar yükleniyor…' : 'İlk mesajı veya toplantı notunu paylaşın.'}</p>}
              {messages.filter(message => !message.hidden).map(message => {
                const mine = message.authorId === user.id, status = message.receipts;
                const allRead = !!status && status.total > 0 && status.read === status.total;
                const allDelivered = !!status && status.total > 0 && status.delivered === status.total;
                return <article key={message.id} data-message-id={message.id} data-unread={message.isRecipient && !mine && !message.myReadAt && !message.deletedAt} className={'forum-message' + (mine ? ' mine' : '')}>
                  <div className="forum-message-author"><Avatar person={{id:message.authorId ?? 0,name:message.name,surname:message.surname,hasAvatar:message.hasAvatar}}/><strong>{fullName(message)}</strong><time title={dateTime(message.createdAt)}>{new Date(message.createdAt).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}</time></div>
                  {message.deletedAt ? <p className="forum-deleted"><Trash2 size={13}/> Bu mesaj silindi.</p> : <>
                    {message.body && <p>{message.body}</p>}
                    {message.files.map(file => <ForumFile key={file.id} forumId={forum.id} file={file}/>)}
                  </>}
                  <div className="forum-message-footer">
                    {message.editedAt && !message.deletedAt && <small title={dateTime(message.editedAt)}>Düzenlendi</small>}
                    {mine && !message.deletedAt && <button className={'forum-receipt-button' + (allRead ? ' read' : '')} title="Mesaj bilgisi" onClick={() => void run(async () => {
                      setReceipts(await api<Receipt[]>('forums/' + selected + '/messages/' + message.id + '/receipts')); setReceiptMessage(message.id);
                    })}>{allRead || allDelivered ? <CheckCheck size={16}/> : <Check size={16}/>}<span>{status?.delivered ?? 0} iletildi · {status?.read ?? 0} görüldü</span></button>}
                    <div className="forum-message-actions">
                      {mine && !message.deletedAt && <button aria-label="Mesajı düzenle" title="Düzenle" disabled={busy} onClick={() => setEditing(message)}><Pencil size={14}/></button>}
                      <button aria-label="Mesajı sil" title="Sil" disabled={busy} onClick={() => setDeleteMessage(message)}><Trash2 size={14}/></button>
                    </div>
                  </div>
                </article>;
              })}
            </div>
            <form ref={composer} className="forum-composer" onSubmit={event => {
              event.preventDefault();
              if (sending.current || busy || (!body.trim() && !files.length)) return;
              sending.current = true;
              void run(async () => {
                const data = fileBody(files); data.set('body',body);
                await api('forums/' + selected + '/messages','POST',data);
                nearBottom.current = true; setBody(''); setFiles([]); if (input.current) input.current.value = '';
                await syncNow.current();
              }).finally(() => {sending.current = false; requestAnimationFrame(() => composer.current?.querySelector('textarea')?.focus());});
            }}>
              <Textarea aria-label="Mesaj veya toplantı notu" placeholder="Mesaj yazın…" value={body} maxLength={5000} disabled={busy} onChange={event => setBody(event.target.value)} onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {event.preventDefault(); if (!event.repeat) composer.current?.requestSubmit();}
              }}/>
              <div className="forum-composer-actions"><label><Paperclip size={16}/> Dosya ekle<input ref={input} type="file" multiple disabled={busy} onChange={event => {
                const picked = Array.from(event.target.files ?? []);
                if (picked.length > 5 || picked.some(file => file.size > 10 * 1024 * 1024)) {setError('En fazla 5 dosya, dosya başına 10 MB seçebilirsiniz.'); event.target.value = ''; setFiles([]); return;}
                setError(''); setFiles(picked);
              }}/></label><small>Enter: gönder · Shift + Enter: yeni satır</small><Button disabled={busy || (!body.trim() && !files.length)}><Send size={15}/>{busy ? 'Gönderiliyor…' : 'Gönder'}</Button></div>
              {!!files.length && <div className="forum-selected-files">{files.map((file,index) => <span key={index}>{file.name}</span>)}<Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => {setFiles([]); if (input.current) input.current.value = '';}}>Seçimi kaldır</Button></div>}
            </form>
          </> : <div className="forum-join-note"><span className="forum-empty-icon"><Users size={30}/></span><h3>{forum.name} sohbetine katılın</h3><p>Mesajları ve dosyaları görmek için yöneticinin katılma isteğinizi onaylaması gerekiyor.</p><Button disabled={busy || forum.status === 'pending'} onClick={() => void run(async () => {await api('forums/' + forum.id + '/join','POST'); await refresh();})}>{forum.status === 'pending' ? <Clock size={17}/> : <UserPlus size={17}/>} {forum.status === 'pending' ? 'İsteğiniz onay bekliyor' : 'Katılma isteği gönder'}</Button></div>}
        </> : <div className="forum-join-note"><span className="forum-empty-icon"><MessageCircle size={32}/></span><h3>Ekip sohbetleriniz burada</h3><p>Mesajları görüntülemek veya katılma isteği göndermek için soldan bir forum seçin.</p></div>}
      </section>
    </div>
    <DialogShell open={draft !== null} title={draft === 'new' ? 'Forum oluştur' : 'Forumu düzenle'} description="Ekip sohbetinin adını, açıklamasını ve görselini belirleyin." busy={busy} error={error} onClose={() => setDraft(null)}>
      {draft && <form key={draft === 'new' ? 'new' : draft.id} onSubmit={event => {
        event.preventDefault(); const data = new FormData(event.currentTarget);
        const image = data.get('image'); if (image instanceof File && !image.size) data.delete('image');
        void run(async () => {await api(draft === 'new' ? 'forums' : 'forums/' + draft.id,draft === 'new' ? 'POST' : 'PATCH',data); setDraft(null); await refresh();});
      }}><label>Forum adı<Input name="name" maxLength={100} required defaultValue={draft === 'new' ? '' : draft.name} placeholder="Mobil Ekip"/></label><label>Açıklama<Textarea name="description" maxLength={2000} defaultValue={draft === 'new' ? '' : draft.description}/></label>
        {draft !== 'new' && draft.hasImage && <ForumPortrait forum={draft}/>}<ForumImagePicker/><Button disabled={busy}><ImagePlus size={15}/> Kaydet</Button>
      </form>}
    </DialogShell>
    <DialogShell open={people !== null} title={'Üyeler ve katılma istekleri' + (forum?.requestCount ? ' (' + forum.requestCount + ')' : '')} description="İstekleri onaylayın veya personeli doğrudan ekleyin." busy={busy} error={error} onClose={() => setPeople(null)}>
      <div className="forum-people">{people?.slice().sort((a,b) => Number(b.status === 'pending')-Number(a.status === 'pending')).map(person => <div key={person.id}><Avatar person={person}/><span><strong>{fullName(person)}</strong><small>{person.status === 'pending' ? 'Katılma isteği' : person.status === 'joined' ? 'Üye' : person.title}</small></span>
        {person.status !== 'joined' && <Button size="sm" disabled={busy} onClick={() => void run(() => manage(person,'POST'))}>{person.status === 'pending' ? 'Onayla' : 'Ekle'}</Button>}
        {person.status && <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => manage(person,'DELETE'))}>{person.status === 'pending' ? 'Reddet' : 'Çıkar'}</Button>}
      </div>)}</div>
    </DialogShell>
    <DialogShell open={editing !== null} title="Mesajı düzenle" description="Güncellenen mesaj tüm üyelerde değişir." busy={busy} error={error} onClose={() => setEditing(null)}>
      {editing && <form key={editing.id} onSubmit={event => {event.preventDefault(); const value = new FormData(event.currentTarget).get('body'); void run(async () => {
        await api('forums/' + selected + '/messages/' + editing.id,'PATCH',{body:value}); setEditing(null); await syncNow.current();
      });}}><label>Mesaj<Textarea name="body" defaultValue={editing.body} maxLength={5000} required autoFocus/></label><Button disabled={busy}>Değişiklikleri kaydet</Button></form>}
    </DialogShell>
    <DialogShell open={deleteMessage !== null} title="Mesajı sil" description="Benden sil yalnızca sizin sohbetinizden kaldırır. Herkesten sil mesajı ve dosyalarını tüm üyelerden kaldırır." busy={busy} error={error} onClose={() => setDeleteMessage(null)}>
      <div className="forum-delete-options"><Button variant="outline" disabled={busy} onClick={() => removeMessage('me')}>Yalnızca benden sil</Button>{deleteMessage?.authorId === user.id && !deleteMessage.deletedAt && <Button variant="destructive" disabled={busy} onClick={() => removeMessage('everyone')}>Herkesten sil</Button>}</div>
    </DialogShell>
    <DialogShell open={receiptMessage !== null} title="Mesaj bilgisi" description={receipts.length + ' alıcı · ' + receipts.filter(item => item.deliveredAt).length + ' iletildi · ' + receipts.filter(item => item.readAt).length + ' görüldü'} busy={busy} error={error} onClose={() => setReceiptMessage(null)}>
      <div className="forum-people">{receipts.map(person => <div key={person.id}><Avatar person={person}/><span><strong>{fullName(person)}</strong><small>İletildi: {person.deliveredAt ? dateTime(person.deliveredAt) : 'Bekleniyor'}</small><small>Görüldü: {person.readAt ? dateTime(person.readAt) : 'Henüz görülmedi'}</small></span>{person.readAt ? <CheckCheck className="forum-read-icon" size={19}/> : person.deliveredAt ? <CheckCheck size={19}/> : <Clock size={17}/>}</div>)}</div>
      {!receipts.length && <p className="muted">Bu mesaj gönderildiğinde forumda başka üye yoktu.</p>}
    </DialogShell>
    <DialogShell open={deleting !== null} title="Forum silinsin mi?" description="Forum, mesajlar ve paylaşılan dosyalar kalıcı olarak silinecek." busy={busy} error={error} onClose={() => setDeleting(null)}>
      <Button variant="destructive" disabled={busy} onClick={() => void run(async () => {await api('forums/' + deleting!.id,'DELETE'); if (selected === deleting!.id) setSelected(null); setDeleting(null); await refresh();})}>Forumu sil</Button>
    </DialogShell>
  </>;
}
