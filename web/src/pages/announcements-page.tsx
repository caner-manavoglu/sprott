import { ArrowLeft, BarChart3, Check, Megaphone, Pencil, Trash2, Users } from 'lucide-react';
import { Button } from '../components/ui';
import { AnnouncementImage, audienceLabel } from '../components/announcement';
import { notificationTime } from '../components/notifications';
import type { Announcement, AnnouncementDetail } from '../lib/types';

type ListProps = {
  announcements: Announcement[];
  busy: boolean;
  /** Okundu takibi yalnızca zorunlu duyurularda vardır. */
  onRead: (item: Announcement) => void;
  onOpenReport: (item: Announcement) => void;
  /** Zorunlu duyurular düzenlenmez; okundu onayını geçersiz kılmamak için yalnızca silinir. */
  onEdit: (item: Announcement) => void;
  onDelete: (item: Announcement) => void;
};

/** Duyuru listesi: okunmamışlar işaretli, yetkisi olanlar okuma raporunu açabilir. */
export function AnnouncementsPage({announcements, busy, onRead, onOpenReport, onEdit, onDelete}: ListProps) {
  if (!announcements.length) {
    return <div className="empty-panel"><div><Megaphone size={22}/></div><strong>Duyuru yok</strong>
      <span>Yöneticiler ve yetkili grup yöneticileri duyuru yayımladığında burada görünür.</span></div>;
  }
  return <div className="announcement-list">
    {announcements.map(item => <article key={item.id}
      className={`summary-card announcement-card${item.mandatory && !item.readAt ? ' unread' : ''}`}>
      <header>
        <div>
          <div className="announcement-tags">
            {item.mandatory && <span className="announcement-required"><Megaphone size={13}/> Zorunlu</span>}
            <span className="permission-tag"><Users size={12}/> {audienceLabel(item)}</span>
            {item.mandatory && !item.readAt && <span className="announcement-new">Yeni</span>}
          </div>
          <h2>{item.title}</h2>
          <p>{item.author?.name ?? 'Silinmiş kullanıcı'} · {notificationTime(item.createdAt)}</p>
        </div>
        <div className="notification-actions">
          {item.mandatory && <Button variant="ghost" size="sm" disabled={busy || !!item.readAt} onClick={() => onRead(item)}>
            <Check size={14}/> {item.readAt ? 'Okundu' : 'Okundu işaretle'}
          </Button>}
          {item.canManage && <>
            {item.mandatory && <Button variant="outline" size="sm" disabled={busy} onClick={() => onOpenReport(item)}>
              <BarChart3 size={14}/> Okuma raporu
            </Button>}
            {!item.mandatory && <Button variant="outline" size="sm" disabled={busy} onClick={() => onEdit(item)}>
              <Pencil size={14}/> Düzenle
            </Button>}
            <Button variant="ghost" size="icon" aria-label="Duyuruyu sil" disabled={busy} onClick={() => onDelete(item)}>
              <Trash2 size={15}/>
            </Button>
          </>}
        </div>
      </header>
      <AnnouncementImage announcement={item} className="announcement-image"/>
      <p className="announcement-body">{item.body}</p>
    </article>)}
  </div>;
}

/** Okuma raporu: duyuruyu kimlerin okuduğu, kimlerin okumadığı. */
export function AnnouncementReportPage({detail, onBack}: {detail: AnnouncementDetail; onBack: () => void}) {
  const {announcement, readers, pending} = detail;
  const total = readers.length + pending.length;
  return <div className="announcement-report">
    <Button variant="outline" size="sm" onClick={onBack}><ArrowLeft size={15}/> Duyurulara dön</Button>

    <section className="summary-card announcement-card">
      <header>
        <div>
          <div className="announcement-tags">
            {announcement.mandatory && <span className="announcement-required"><Megaphone size={13}/> Zorunlu</span>}
            <span className="permission-tag"><Users size={12}/> {audienceLabel(announcement)}</span>
          </div>
          <h2>{announcement.title}</h2>
          <p>{readers.length} / {total} kişi okudu.</p>
        </div>
      </header>
      <AnnouncementImage announcement={announcement} className="announcement-image"/>
      <p className="announcement-body">{announcement.body}</p>
    </section>

    <div className="announcement-columns">
      <section className="summary-card">
        <header><div><h2>Okuyanlar ({readers.length})</h2></div></header>
        <ul className="announcement-people">
          {readers.map(person => <li key={person.id}>
            <span className="user-avatar">{person.name?.[0] ?? '?'}</span>
            <div><strong>{person.name}</strong><small>{person.title}</small></div>
            <small>{notificationTime(person.readAt)}</small>
          </li>)}
          {!readers.length && <li className="muted text-xs">Henüz kimse okumadı.</li>}
        </ul>
      </section>

      <section className="summary-card">
        <header><div><h2>Okumayanlar ({pending.length})</h2></div></header>
        <ul className="announcement-people">
          {pending.map(person => <li key={person.id}>
            <span className="user-avatar">{person.name?.[0] ?? '?'}</span>
            <div><strong>{person.name}</strong><small>{person.title}</small></div>
          </li>)}
          {!pending.length && <li className="muted text-xs">Herkes okudu.</li>}
        </ul>
      </section>
    </div>
  </div>;
}
