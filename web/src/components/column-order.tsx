import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { GripVertical } from 'lucide-react';
import { Button } from './ui';

type Column = {id: number; name: string};
export function ColumnOrder({columns, disabled, onReorder, onPreview, children}: {
  columns: Column[]; disabled: boolean;
  onReorder: (ids: number[]) => Promise<boolean>;
  // Sıra değişir değişmez panoyu da haberdar eder; kaydetme yanıtı beklenmez.
  onPreview?: (ids: number[]) => void;
  children: (column: Column) => ReactNode;
}) {
  const [order, setOrder] = useState(columns), [dragging, setDragging] = useState<number|null>(null);
  const list = useRef<HTMLDivElement>(null), current = useRef(columns);
  const previous = useRef(new Map<number, DOMRect>());
  const drag = useRef<{id: number; y: number; moved: boolean}|null>(null);
  function update(next: Column[], preview = true) {
    current.current = next; setOrder(next);
    if (preview) onPreview?.(next.map(column => column.id));
  }
  useEffect(() => { if (!drag.current) update(columns, false); }, [columns]);
  useLayoutEffect(() => {
    list.current?.querySelectorAll<HTMLElement>('[data-column-row]').forEach(row => {
      const id = Number(row.dataset.columnRow), rect = row.getBoundingClientRect(), before = previous.current.get(id);
      if (before && before.top !== rect.top && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        row.getAnimations().forEach(animation => animation.cancel());
        row.animate([{transform: `translateY(${before.top - rect.top}px)`}, {transform: 'translateY(0)'}], {duration: 180, easing: 'ease-out'});
      }
      previous.current.set(id, rect);
    });
  }, [order]);
  function move(id: number, target: number) {
    const next = [...current.current], from = next.findIndex(column => column.id === id);
    if (from < 0 || target < 0 || target >= next.length || from === target) return;
    next.splice(target, 0, next.splice(from, 1)[0]); update(next);
  }
  async function save() {
    if (current.current.every((column, index) => column.id === columns[index]?.id)) return;
    if (!await onReorder(current.current.map(column => column.id))) update(columns);
  }
  return <div ref={list} className="column-order" aria-label="Sütun sıralaması">
    <p className="text-xs text-muted-foreground" id="column-order-help">Tutamacı sürükleyin veya odaklayıp ↑ / ↓ tuşlarıyla sıralayın.</p>
    {order.map(column => <div className={`column-order-row ${dragging === column.id ? 'is-dragging' : ''}`} data-column-row={column.id} key={column.id}>
      <Button type="button" variant="ghost" size="icon" className="column-drag-handle" disabled={disabled} aria-label={`${column.name} sırasını değiştir`} aria-describedby="column-order-help"
        onPointerDown={event => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {id: column.id, y: event.clientY, moved: false}; setDragging(column.id);
        }}
        onPointerMove={event => {
          const active = drag.current;
          if (!active || Math.abs(event.clientY - active.y) < 6 && !active.moved) return;
          active.moved = true;
          const rows = [...(list.current?.querySelectorAll<HTMLElement>('[data-column-row]') || [])];
          // offsetTop is the layout position, unaffected by the short reorder animation.
          const target = rows.findIndex(row => { const top = row.offsetTop + (row.offsetParent?.getBoundingClientRect().top || 0); return event.clientY >= top && event.clientY <= top + row.offsetHeight; });
          if (target >= 0) move(active.id, target);
        }}
        onPointerUp={() => { if (!drag.current) return; drag.current = null; setDragging(null); void save(); }}
        onPointerCancel={() => {drag.current = null; setDragging(null); update(columns);}}
        onKeyDown={event => {
          if (event.key === 'Escape') {drag.current = null;setDragging(null);update(columns);}
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
          event.preventDefault(); move(column.id, current.current.findIndex(item => item.id === column.id) + (event.key === 'ArrowUp' ? -1 : 1)); void save();
        }}><GripVertical size={17}/></Button>
      {children(column)}
    </div>)}
    <span className="sr-only" aria-live="polite">{order.map(column => column.name).join(', ')}</span>
  </div>;
}
