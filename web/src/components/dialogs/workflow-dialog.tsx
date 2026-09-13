import { useEffect, useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { Button } from '../ui';
import { DialogActions, DialogShell } from './shell';
import type { Board, Transition } from '../../lib/types';

type Props = {
  open: boolean;
  board: Board;
  busy: boolean;
  error: string;
  /** Kural yoksa kaydetme "oluşturma", varsa "güncelleme" yetkisine bağlıdır. */
  canSave: boolean;
  canClear: boolean;
  onClose: () => void;
  onSave: (transitions: Transition[]) => void;
  onClear: () => void;
};

const key = (fromColumnId: number, toColumnId: number) => `${fromColumnId}-${toColumnId}`;

/**
 * Akış kuralları: hangi sütundan hangi sütuna geçilebileceğini proje bazında belirler.
 * Kural tanımlanmamış projede tüm geçişler serbesttir; yöneticiler kurallara tabi değildir.
 */
export function WorkflowDialog({open, board, busy, error, canSave, canClear, onClose, onSave, onClear}: Props) {
  const [allowed, setAllowed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    // Kural yoksa varsayılan olarak tüm geçişler işaretli gelir; kullanıcı istemediklerini kapatır.
    setAllowed(new Set(board.transitions.length
      ? board.transitions.map(step => key(step.fromColumnId, step.toColumnId))
      : board.columns.flatMap(from => board.columns.filter(to => to.id !== from.id).map(to => key(from.id, to.id)))));
  }, [open, board.transitions, board.columns]);

  const toggle = (fromColumnId: number, toColumnId: number) => setAllowed(current => {
    const next = new Set(current), item = key(fromColumnId, toColumnId);
    next.has(item) ? next.delete(item) : next.add(item);
    return next;
  });

  const transitions = [...allowed].map(item => {
    const [fromColumnId, toColumnId] = item.split('-').map(Number);
    return {fromColumnId, toColumnId};
  });

  return <DialogShell open={open} busy={busy} error={error} onClose={onClose} wide
    title="Akış kuralları"
    description="Satır: task’ın bulunduğu sütun. Sütun: taşınabileceği hedef. İşaretlenmeyen geçişler personele kapalıdır; yöneticiler kurallardan etkilenmez.">
    <div className="workflow-grid table-scroll">
      <table>
        <thead><tr>
          <th>Nereden ↓ / Nereye →</th>
          {board.columns.map(column => <th key={column.id}>{column.name}</th>)}
        </tr></thead>
        <tbody>{board.columns.map(from => <tr key={from.id}>
          <td><strong>{from.name}</strong></td>
          {board.columns.map(to => <td key={to.id}>
            {from.id === to.id
              ? <span className="permission-summary">—</span>
              : <input type="checkbox" aria-label={`${from.name} sütunundan ${to.name} sütununa geçiş`}
                  checked={allowed.has(key(from.id, to.id))} disabled={busy || !canSave}
                  onChange={() => toggle(from.id, to.id)}/>}
          </td>)}
        </tr>)}</tbody>
      </table>
    </div>

    <p className="text-xs text-muted-foreground">
      {board.transitions.length
        ? `${board.transitions.length} geçiş tanımlı. Akışı kapatırsanız tüm geçişler yeniden serbest kalır.`
        : 'Bu projede akış tanımlı değil; şu anda tüm geçişler serbest.'}
    </p>

    <DialogActions busy={busy} onCancel={onClose}>
      {canClear && !!board.transitions.length && <Button type="button" variant="ghost" disabled={busy} onClick={onClear}>
        <Trash2 size={15}/> Akışı kapat
      </Button>}
      <Button type="button" disabled={busy || !canSave || !transitions.length} onClick={() => onSave(transitions)}>
        {busy ? 'Kaydediliyor…' : 'Akışı kaydet'} <Check size={15}/>
      </Button>
    </DialogActions>
  </DialogShell>;
}
