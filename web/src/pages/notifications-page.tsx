import { ArrowRight, BellOff, Check, CheckCheck } from 'lucide-react';
import { Button } from '../components/ui';
import { NotificationIcon, notificationText, notificationTime } from '../components/notifications';
import type { Notification, NotificationFeed } from '../lib/types';

type Props = {
  feed: NotificationFeed;
  busy: boolean;
  /** Task'a git: bildirimi okundu işaretler ve panoda task detayını açar. Duyurularda duyuru sayfasına gider. */
  onOpen: (item: Notification) => void;
  onRead: (item: Notification) => void;
  onReadAll: () => void;
};

/** Bildirim listesi: her satırda task'a gitme ve okundu işaretleme seçenekleri. */
export function NotificationsPage({feed, busy, onOpen, onRead, onReadAll}: Props) {
  if (!feed.items.length) {
    return <div className="empty-panel"><div><BellOff size={22}/></div><strong>Bildiriminiz yok</strong>
      <span>Size task atandığında, etiketlendiğinizde, task’ınıza yorum yapıldığında veya yeni duyuru yayımlandığında burada görünür.</span></div>;
  }
  return <section className="summary-card notification-page">
    <header>
      <div><h2>Bildirimler</h2><p>{feed.unread ? `${feed.unread} okunmamış bildirim.` : 'Tüm bildirimler okundu.'}</p></div>
      <Button variant="outline" size="sm" disabled={busy || !feed.unread} onClick={onReadAll}>
        <CheckCheck size={15}/> Tümünü okundu işaretle
      </Button>
    </header>
    <ul className="notification-rows">
      {feed.items.map(item => <li key={item.id} className={item.readAt ? '' : 'unread'}>
        <NotificationIcon type={item.type}/>
        <div>
          <strong>{notificationText(item)}</strong>
          <small>{item.projectName ?? 'Duyuru'} · {notificationTime(item.createdAt)}</small>
        </div>
        <div className="notification-actions">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => onOpen(item)}>
            {item.type === 'announcement' ? 'Duyuruya git' : 'Task’a git'} <ArrowRight size={14}/>
          </Button>
          <Button variant="ghost" size="sm" disabled={busy || !!item.readAt} onClick={() => onRead(item)}>
            <Check size={14}/> {item.readAt ? 'Okundu' : 'Okundu işaretle'}
          </Button>
        </div>
      </li>)}
    </ul>
  </section>;
}
