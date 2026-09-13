import { ChevronDown, ChevronUp, ChevronsDown, ChevronsUp, Flame, X } from 'lucide-react';
import { taskPriorities, type TaskPriority } from '../../../shared/task-priorities';

export const taskPriorityLabels: Record<TaskPriority, string> = {
  lowest: 'Çok düşük', low: 'Düşük', normal: 'Orta', high: 'Yüksek', highest: 'Çok yüksek',
};
const icons = {lowest: ChevronsDown, low: ChevronDown, normal: ChevronUp, high: ChevronsUp, highest: Flame};
/** Seçim listelerinde en yüksek öncelik üstte durur. */
export const taskPriorityOptions = [...taskPriorities].reverse()
  .map(value => ({value, label: taskPriorityLabels[value]}));

/** Panoda ve task ayrıntısında görünen öncelik rozeti. */
export function TaskPriorityBadge({priority}: {priority: TaskPriority}) {
  const Icon = icons[priority];
  return <span className="task-priority" data-priority={priority}><Icon size={13}/>{taskPriorityLabels[priority]}</span>;
}

/** Pano üstündeki öncelik filtresi; seçili yoksa tüm öncelikler görünür. */
export function PriorityFilter({selected, onToggle, onClear}: {
  selected: TaskPriority[]; onToggle: (priority: TaskPriority) => void; onClear: () => void;
}) {
  return <div className="board-priorities">
    {[...taskPriorities].reverse().map(priority => {
      const Icon = icons[priority];
      const active = selected.includes(priority);
      return <button key={priority} type="button" className={`priority-chip ${active ? 'active' : ''}`}
        data-priority={priority} aria-pressed={active}
        title={`${taskPriorityLabels[priority]} öncelikli task’lar`} onClick={() => onToggle(priority)}>
        <Icon size={13}/>{taskPriorityLabels[priority]}
      </button>;
    })}
    {selected.length > 0 && <button type="button" className="filter-pill" onClick={onClear}>
      Önceliği temizle <X size={12}/>
    </button>}
  </div>;
}
