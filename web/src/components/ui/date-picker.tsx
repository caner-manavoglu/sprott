import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { dateLabel, isoDate, isoParts } from '../../lib/format';

const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

type Props = {
  /** Formda taşınacak alan adı; gizli input üzerinden FormData'ya girer. */
  name: string;
  /** 'YYYY-MM-DD' ya da boş metin. */
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  /** Seçimi kaldırma düğmesi; zorunlu alanlarda kapalı bırakılır. */
  clearable?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
};

/** Pazartesi ile başlayan hafta içindeki sıra. */
const weekdayIndex = (date: Date) => (date.getDay() + 6) % 7;

/** Takvim ızgarası: görünen ayı tam haftalar hâlinde saran 42 gün. */
function monthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - weekdayIndex(first));
  return Array.from({length: 42}, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
}

/**
 * Tema ile birlikte boyanan tarih seçici. Tarayıcının yerel takvimi
 * işletim sisteminin renklerini kullandığı ve koyu temaya uymadığı için
 * açılır panel burada çiziliyor; değer gizli input ile forma taşınır.
 */
export function DatePicker({name, value, onChange, min, max, clearable = false, placeholder = 'Tarih seçin', ariaLabel, disabled}: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const today = isoDate();
  const [view, setView] = useState(() => (value || today).slice(0, 7));

  const panel = useRef<HTMLDivElement>(null);

  // Panel her açılışta seçili ayı (yoksa bugünü) gösterir.
  useEffect(() => {if (open) setView((value || today).slice(0, 7));}, [open]);

  // Açılış animasyonu bittikten sonra takvimi görünür alana çeker.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => panel.current?.scrollIntoView({block: 'nearest', behavior: 'smooth'}), 340);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Tarih paneli kapanır, arkasındaki modal açık kalır.
      event.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape, true);
    };
  }, [open]);

  const [year, month] = view.split('-').map(Number);
  const shiftMonth = (step: number) => setView(isoParts(new Date(year, month - 1 + step, 1)).slice(0, 7));
  const blocked = (iso: string) => (!!min && iso < min) || (!!max && iso > max);

  const pick = (iso: string) => {
    onChange(iso);
    setOpen(false);
  };

  return <div className="datepicker" ref={root}>
    <input type="hidden" name={name} value={value}/>
    <button type="button" className={`datepicker-trigger${value ? '' : ' empty'}`} disabled={disabled}
      aria-label={ariaLabel} aria-expanded={open} onClick={() => setOpen(state => !state)}>
      <CalendarDays size={15}/>
      <span>{value ? dateLabel(value) : placeholder}</span>
    </button>

    {/* Panel DOM'da kalır: `.reveal` yüksekliği canlandırır, modal sıçramadan büyür. */}
    <div className="reveal" data-open={open} inert={!open}><div>
      <div className="datepicker-panel" ref={panel} role="dialog" aria-label={ariaLabel ?? 'Tarih seçin'}>
      <header>
        <button type="button" aria-label="Önceki ay" onClick={() => shiftMonth(-1)}><ChevronLeft size={16}/></button>
        <strong>{MONTHS[month - 1]} {year}</strong>
        <button type="button" aria-label="Sonraki ay" onClick={() => shiftMonth(1)}><ChevronRight size={16}/></button>
      </header>

      <div className="datepicker-weekdays">{WEEKDAYS.map(day => <span key={day}>{day}</span>)}</div>

      <div className="datepicker-days">{monthGrid(year, month - 1).map(date => {
        const iso = isoParts(date);
        const classes = [
          date.getMonth() !== month - 1 ? 'outside' : '',
          iso === value ? 'selected' : '',
          iso === today ? 'today' : '',
        ].filter(Boolean).join(' ');
        return <button key={iso} type="button" className={classes} disabled={blocked(iso)}
          aria-pressed={iso === value} onClick={() => pick(iso)}>{date.getDate()}</button>;
      })}</div>

      <footer>
        <button type="button" disabled={blocked(today)} onClick={() => pick(today)}>Bugün</button>
        {clearable && !!value && <button type="button" className="clear" onClick={() => pick('')}>
          <X size={13}/> Temizle
        </button>}
      </footer>
      </div>
    </div></div>
  </div>;
}
