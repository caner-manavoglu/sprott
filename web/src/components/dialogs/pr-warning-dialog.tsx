import { AlertTriangle, ArrowRight, Check, ExternalLink } from 'lucide-react';
import { Button } from '../ui';
import { DialogActions, DialogShell } from './shell';
import { taskCode } from '../../lib/format';
import type { Task } from '../../lib/types';

type Props = {
  task: Task | null;
  /** Taşınmak istenen sütunun adı; uyarı metninde geçer. */
  columnName: string;
  busy: boolean;
  error: string;
  /** `pr.merge` yetkisi yoksa onaylama düğmeleri gizlenir, uyarı yine çıkar. */
  canMerge: boolean;
  onMerge: (pullRequestId: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Task tamamlandı sütununa taşınırken açık PR'ı varsa çıkar. Engellemez:
 * bekleyen PR'ları gösterir, oradan onaylamaya izin verir ve yine de taşımayı
 * bilinçli bir seçime dönüştürür. Taşıma gerçekleşirse sunucu günlüğe not düşer.
 */
export function PrWarningDialog({task, columnName, busy, error, canMerge, onMerge, onConfirm, onCancel}: Props) {
  const open = task?.pullRequests.filter(pullRequest => pullRequest.state === 'open') ?? [];

  return <DialogShell open={task !== null && open.length > 0} busy={busy} error={error} onClose={onCancel}
    title="Açık PR var" description={task ? `${taskCode(task.id)} · ${task.title}` : ''}>
    <div className="pr-warning">
      <p className="pr-warning-lead">
        <AlertTriangle size={16}/>
        Bu task’ın <strong>{open.length} açık pull request’i</strong> var, ancak “{columnName}” sütununa taşınmak üzere.
      </p>

      <div className="pr-warning-list">
        {open.map(pullRequest => <div key={pullRequest.id} className="pr-warning-row">
          <a href={pullRequest.url} target="_blank" rel="noreferrer noopener">
            {pullRequest.title} <ExternalLink size={12}/>
          </a>
          {canMerge && <Button type="button" variant="outline" size="sm" disabled={busy}
            onClick={() => onMerge(pullRequest.id)}><Check size={14}/> Onaylandı işaretle</Button>}
        </div>)}
      </div>

      <p className="muted text-xs">
        PR merge edildiyse yukarıdan onaylandı olarak işaretleyin. Yine de taşırsanız bu durum etkinlik günlüğüne kaydedilir.
      </p>

      <DialogActions busy={busy} onCancel={onCancel} cancelLabel="Vazgeç">
        <Button type="button" variant="destructive" disabled={busy} onClick={onConfirm}>
          Yine de taşı <ArrowRight size={15}/>
        </Button>
      </DialogActions>
    </div>
  </DialogShell>;
}
