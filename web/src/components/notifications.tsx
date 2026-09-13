import { useEffect, useRef } from 'react';
import { AtSign, Bell, CheckCheck, CheckCircle2, MessageSquare, Megaphone, UserPlus } from 'lucide-react';
import { Button } from './ui';
import { taskTypeLabels } from './task-type';
import type { Notification, NotificationFeed } from '../lib/types';

const icons = {assigned: UserPlus, completed: CheckCircle2, mention: AtSign, comment: MessageSquare, announcement: Megaphone};

/** Bildirim metni tek yerde üretilir; sunucu yalnızca tür ve ilgili kayıtları tutar. */
export function notificationText(item: Notification) {
  const who = item.actorName ?? 'Bir kullanıcı';
  switch (item.type) {
    case 'assigned': return `Bu projede üzerinize ${taskTypeLabels[item.taskType ?? 'task'].toLocaleLowerCase('tr')} atandı: ${item.taskTitle}`;
    case 'completed': return `${who}, “${item.taskTitle}” task’ını tamamlandı sütununa taşıdı`;
    case 'mention': return `${who} sizi “${item.taskTitle}” task’ında etiketledi`;
    case 'comment': return `${who}, üzerinizdeki “${item.taskTitle}” task’ına yorum yaptı`;
    case 'announcement': return `${who} yeni bir duyuru yayımladı: ${item.announcementTitle}`;
  }
}

/** Bildirim zamanı: gün, ay ve saat; liste kısa kalsın diye yıl yazılmaz. */
export const notificationTime = (iso: string) =>
  new Date(iso).toLocaleString('tr-TR', {day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'});

export function NotificationIcon({type}: {type: Notification['type']}) {
  const Icon = icons[type];
  return <span className="notification-icon" data-type={type}><Icon size={15}/></span>;
}

/** Rozet: dokuzdan fazlası "9+" olarak gösterilir. */
export const unreadLabel = (unread: number) => (unread > 9 ? '9+' : String(unread));

type Props = {
  feed: NotificationFeed;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  /** Panelde bildirime tıklamak yalnızca okundu işaretler; task'a gitmek bildirimler sayfasından yapılır. */
  onOpen: (item: Notification) => void;
  onReadAll: () => void;
  onSeeAll: () => void;
};

/** Üst çubuktaki zil: okunmamış sayısı rozette, son bildirimler açılır panelde. */
export function NotificationBell({feed, open, onToggle, onClose, onOpen, onReadAll, onSeeAll}: Props) {
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {if (!holder.current?.contains(event.target as Node)) onClose();};
    const escape = (event: KeyboardEvent) => {if (event.key === 'Escape') onClose();};
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [open, onClose]);

  return <div className="notification-holder" ref={holder}>
    <Button type="button" variant="outline" size="icon" className="notification-button" aria-expanded={open}
      aria-label={feed.unread ? `Bildirimler (${feed.unread} okunmamış)` : 'Bildirimler'} title="Bildirimler"
      onClick={onToggle}>
      <Bell size={17}/>
      {!!feed.unread && <span className="notification-badge">{unreadLabel(feed.unread)}</span>}
    </Button>

    {open && <div className="notification-panel" role="dialog" aria-label="Bildirimler">
      <header>
        <strong>Bildirimler</strong>
        <Button variant="ghost" size="sm" disabled={!feed.unread} onClick={onReadAll}>
          <CheckCheck size={14}/> Tümünü okundu işaretle
        </Button>
      </header>
      <div className="notification-list">
        {feed.items.map(item => <button type="button" key={item.id} className={item.readAt ? '' : 'unread'}
          onClick={() => onOpen(item)}>
          <NotificationIcon type={item.type}/>
          <span>
            <strong>{notificationText(item)}</strong>
            <small>{item.projectName ?? 'Duyuru'} · {notificationTime(item.createdAt)}</small>
          </span>
        </button>)}
        {!feed.items.length && <p className="notification-empty">Henüz bildiriminiz yok.</p>}
      </div>
      <footer><Button variant="ghost" size="sm" onClick={onSeeAll}>Tüm bildirimler</Button></footer>
    </div>}
  </div>;
}
