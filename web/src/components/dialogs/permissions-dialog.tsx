import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '../ui';
import { DialogActions, DialogShell } from './shell';
import { moduleLabels } from '../../routes';
import { byModule } from '../../lib/permissions';
import type { Definition, User } from '../../lib/types';

type Props = {
  person: User | null;
  definitions: Definition[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (permissions: Record<string, boolean>, person: User) => void;
};

export function PermissionsDialog({person, definitions, busy, error, onClose, onSubmit}: Props) {
  const [draft, setDraft] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!person) return;
    setDraft(Object.fromEntries(definitions.map(definition => [definition.key, person.permissions?.[definition.key] === true])));
  }, [person, definitions]);

  /** Grup raporu ve duyuru yetkisi yalnızca bir grubu yöneten kullanıcıda anlamlı. */
  const managerOnly = ['report.view.group', 'announcement.create'];
  const visible = (definition: Definition) =>
    !managerOnly.includes(definition.key) || !!person?.managedGroups?.length;

  return <DialogShell open={person !== null} busy={busy} error={error} onClose={onClose}
    title="Yetkileri düzenle" description={person ? `${person.name} · ${person.email}` : undefined}>
    <form onSubmit={event => {
      event.preventDefault();
      if (person) onSubmit(draft, person);
    }}>
      {Object.entries(byModule(definitions)).map(([module, items]) => <section className="permission-group" key={module}>
        <h3>{moduleLabels[module] || module}</h3>
        {items.filter(visible).map(definition => <label className="switch-label permission-row" key={definition.key}
          title={definition.key === 'report.view.group'
            ? `Yönettiği gruplar: ${person?.managedGroups?.join(', ')}. Açıkken bu grupların üyelerinin raporlarını görebilir.`
            : definition.key === 'announcement.create'
            ? `Yönettiği gruplar: ${person?.managedGroups?.join(', ')}. Açıkken yalnızca bu gruplara duyuru yayımlayabilir.`
            : undefined}>
          <input type="checkbox" role="switch" checked={draft[definition.key] === true} disabled={busy}
            onChange={event => {
              const checked = event.target.checked;
              setDraft(current => ({...current, [definition.key]: checked}));
            }}/>
          <span className="switch-track"/>
          <span>{definition.label}</span>
        </label>)}
      </section>)}

      <DialogActions busy={busy} onCancel={onClose}>
        <Button disabled={busy}>{busy ? 'Kaydediliyor…' : 'Yetkileri kaydet'}<Check size={15}/></Button>
      </DialogActions>
    </form>
  </DialogShell>;
}
