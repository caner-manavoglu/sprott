import { CheckCircle2, CircleDot, XCircle } from 'lucide-react';
import type { PrState } from '../lib/types';

export const prStateLabels: Record<PrState, string> = {
  open: 'Bekliyor', merged: 'Onaylandı', closed: 'Kapatıldı',
};
const icons = {open: CircleDot, merged: CheckCircle2, closed: XCircle};

/** PR durumu rozeti; renkler `tokens.css` üzerinden iki temada da çalışır. */
export function PrStateBadge({state}: {state: PrState}) {
  const Icon = icons[state];
  return <span className="pr-state" data-state={state}><Icon size={13}/>{prStateLabels[state]}</span>;
}

/** Bekleme süresi; yalnızca açık PR'larda anlamlıdır. */
export const waitingLabel = (days: number) =>
  days <= 0 ? 'bugün eklendi' : `${days} gündür bekliyor`;
