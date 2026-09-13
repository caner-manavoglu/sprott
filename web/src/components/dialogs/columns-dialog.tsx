import { Check, Plus, Trash2 } from 'lucide-react';
import { Button, Input } from '../ui';
import { ColumnOrder } from '../column-order';
import { DialogShell } from './shell';
import type { Board } from '../../lib/types';

type Props = {
  open: boolean;
  board: Board;
  busy: boolean;
  error: string;
  onClose: () => void;
  onPreview: (columnIds: number[]) => void;
  /** Sıra kaydedilemezse ColumnOrder eski sıraya döner, bu yüzden sonuç beklenir. */
  onReorder: (columnIds: number[]) => Promise<boolean>;
  onRename: (columnId: number, name: string) => void;
  onRemove: (columnId: number) => void;
  onCreate: (name: string, done: () => void) => void;
};

export function ColumnsDialog({open, board, busy, error, onClose, onPreview, onReorder, onRename, onRemove, onCreate}: Props) {
  return <DialogShell open={open} busy={busy} error={error} onClose={onClose}
    title="Sütunları düzenle" description="Sütunları sürükleyerek sıralayın, adlandırın veya boş sütunları kaldırın.">
    <div className="column-settings">
      <ColumnOrder columns={board.columns} disabled={busy} onPreview={onPreview} onReorder={onReorder}>
        {column => <form className="column-edit" key={`${column.id}-${column.name}`} onSubmit={event => {
          event.preventDefault();
          onRename(column.id, String(new FormData(event.currentTarget).get('name')));
        }}>
          <Input name="name" defaultValue={column.name} aria-label="Sütun adı" maxLength={60} required/>
          <Button variant="outline" size="icon" disabled={busy} aria-label={`${column.name} adını kaydet`}><Check size={16}/></Button>
          <Button type="button" variant="ghost" size="icon" aria-label={`${column.name} sütununu sil`}
            title="Yalnızca boş sütunlar silinebilir"
            disabled={busy || board.columns.length === 1 || board.tasks.some(task => task.columnId === column.id)}
            onClick={() => onRemove(column.id)}>
            <Trash2 size={16}/>
          </Button>
        </form>}
      </ColumnOrder>

      <form className="new-column-form" onSubmit={event => {
        event.preventDefault();
        const form = event.currentTarget;
        onCreate(String(new FormData(form).get('name')), () => form.reset());
      }}>
        <label>Yeni sütun<Input name="name" placeholder="Sütun adı" maxLength={60} required/></label>
        <Button disabled={busy}><Plus size={16}/> Sütun ekle</Button>
      </form>

      <p className="text-xs text-muted-foreground">
        {board.columns.length} sütun var. Silmek için önce sütundaki task’ları taşıyın.
      </p>
    </div>
  </DialogShell>;
}
