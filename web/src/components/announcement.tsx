import { useEffect, useState } from 'react';
import { Image, Megaphone } from 'lucide-react';
import { apiBlob } from '../api';
import { Button, Dialog, DialogContent, DialogTitle } from './ui';
import type { Announcement } from '../lib/types';

/** Duyuru görseli yetki gerektirdiği için token'lı istekle alınır ve nesne URL'i olarak gösterilir. */
export function AnnouncementImage({announcement, className}: {announcement: Announcement; className?: string}) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    if (!announcement.hasImage) return;
    let url = '', active = true;
    void apiBlob(`announcements/${announcement.id}/image`).then(blob => {
      url = URL.createObjectURL(blob);
      if (active) setSrc(url); else URL.revokeObjectURL(url);
    }).catch(() => {});
    return () => {active = false; if (url) URL.revokeObjectURL(url);};
  }, [announcement.id, announcement.hasImage]);
  if (!announcement.hasImage) return null;
  return src
    ? <img className={className} src={src} alt={announcement.title}/>
    : <span className="attachment-loading"><Image size={18}/></span>;
}

/** Duyurunun hedefi: grup seçilmemişse herkese açıktır. */
export const audienceLabel = (announcement: Announcement) =>
  announcement.groups.length ? announcement.groups.map(group => group.name).join(', ') : 'Herkes';

/**
 * Zorunlu duyuru modalı: kişinin hiç görmediği zorunlu duyurular sırayla açılır.
 * Kapatmanın tek yolu okundu işaretlemektir, bu yüzden Esc, dışarı tıklama ve
 * kapatma düğmesi devre dışıdır.
 */
export function AnnouncementPopup({items, busy, onRead}: {items: Announcement[]; busy: boolean; onRead: (item: Announcement) => void}) {
  const item = items[0];
  if (!item) return null;
  return <Dialog open>
    <DialogContent className="announcement-popup max-w-xl"
      onEscapeKeyDown={event => event.preventDefault()}
      onPointerDownOutside={event => event.preventDefault()}
      onInteractOutside={event => event.preventDefault()}>
      <div>
        <span className="announcement-required"><Megaphone size={13}/> Zorunlu duyuru</span>
        <DialogTitle className="text-xl font-semibold mt-2">{item.title}</DialogTitle>
        {item.author && <p className="muted text-xs mt-1">{item.author.name}</p>}
      </div>
      <AnnouncementImage announcement={item} className="announcement-image"/>
      <p className="announcement-body">{item.body}</p>
      <div className="form-actions">
        {items.length > 1 && <span className="muted text-xs">{items.length - 1} duyuru daha var.</span>}
        <Button disabled={busy} onClick={() => onRead(item)}>
          {busy ? 'Kaydediliyor…' : 'Okudum, kapat'}
        </Button>
      </div>
    </DialogContent>
  </Dialog>;
}
