import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleCheck, CircleAlert, X } from 'lucide-react';
import type { ToastMessage } from '../lib/toast';

type Item = ToastMessage & {id: number};
function ToastItem({item, dismiss}: {item: Item; dismiss: (id: number) => void}) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => dismiss(item.id), item.kind === 'error' ? 8000 : 4500);
    return () => clearTimeout(timer);
  }, [item.id, item.kind, paused, dismiss]);
  const Icon = item.kind === 'error' ? CircleAlert : CircleCheck;
  return <div className={`toast toast--${item.kind}`} role={item.kind === 'error' ? 'alert' : 'status'}
    onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
    onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
    <Icon size={21} aria-hidden="true"/><p>{item.message}</p>
    <button type="button" aria-label="Bildirimi kapat" onClick={() => dismiss(item.id)}><X size={16}/></button>
  </div>;
}

export function Toaster() {
  const [items, setItems] = useState<Item[]>([]);
  const [dismiss] = useState(() => (id: number) => setItems(current => current.filter(item => item.id !== id)));
  useEffect(() => {
    let nextId = 0;
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<ToastMessage>).detail;
      const item = {...detail, id: ++nextId};
      setItems(current => [...current.filter(previous => previous.message !== item.message || previous.kind !== item.kind), item].slice(-4));
    };
    window.addEventListener('sprott-toast', receive);
    return () => window.removeEventListener('sprott-toast', receive);
  }, []);
  return createPortal(<section className="toast-region" aria-label="İşlem bildirimleri" aria-live="polite" aria-relevant="additions">
    {items.map(item => <ToastItem key={item.id} item={item} dismiss={dismiss}/>)}</section>, document.body);
}
