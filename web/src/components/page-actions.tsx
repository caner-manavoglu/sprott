import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Sayfa başlığındaki eylem alanı; App doldurur, sayfalar `PageActions` ile düğme koyar. */
export const PageActionsSlot = createContext<HTMLElement | null>(null);

/** Sayfaya ait düğmeleri (ör. "Kullanıcı ekle") başlıktaki eylem alanına taşır. */
export function PageActions({children}: {children: ReactNode}) {
  const slot = useContext(PageActionsSlot);
  return slot ? createPortal(children, slot) : null;
}
