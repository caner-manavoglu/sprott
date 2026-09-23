import { useEffect, useState } from 'react';
import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { api } from '../api';
import { Button } from '../components/ui';
import { PermissionsDialog } from '../components/dialogs/permissions-dialog';
import { useAsync } from '../lib/use-async';
import { fullName, roleLabel } from '../lib/format';
import { moduleName, moduleSummary } from '../lib/permissions';
import type { Definition, User } from '../lib/types';
import { Avatar } from '../components/avatar';

export function PermissionsPage() {
  const {busy, error, setError, run} = useAsync();
  const [people, setPeople] = useState<User[]>([]);
  const [definitions, setDefinitions] = useState<Definition[]>([]);
  const [editing, setEditing] = useState<User | null>(null);
  useEffect(() => {
    void run(async () => {
      const [list, keys] = await Promise.all([api<User[]>('permissions'), api<Definition[]>('permissions/definitions')]);
      setPeople(list);
      setDefinitions(keys);
    });
  }, []);
  const onEdit = (person: User) => {setError(''); setEditing(person);};

  return <div className="permissions-panel">
    {!editing && error && <p className="error" role="alert">{error}</p>}
    <div className="permissions-heading">
      <div className="permission-icon"><ShieldCheck size={21}/></div>
      <div><h2>Modül yetkileri</h2><p>Yöneticiler tüm yetkilere sahiptir; personel yetkilerini buradan düzenleyin.</p></div>
    </div>

    <div className="table-scroll"><table>
      <thead><tr><th>Kullanıcı</th><th>Rol</th><th>Yetkiler</th><th>Aksiyonlar</th></tr></thead>
      <tbody>{people.map(person => {
        const summary = moduleSummary(person, definitions);
        return <tr key={person.id}>
          <td><div className="person">
            <Avatar person={person}/>
            <div><strong>{fullName(person)}</strong><small>{person.email}</small></div>
          </div></td>
          <td><span className={`person-role ${person.role}`}>{roleLabel(person.role)}</span></td>
          <td>{person.role === 'admin'
            ? <span className="permission-summary">Tüm yetkiler</span>
            : <div className="permission-tags">
                {/* Modül başına tek rozet; tam liste ipucunda ve düzenleme modalında. */}
                {summary.map(entry => <span className="permission-tag" key={entry.module}
                  data-full={entry.granted === entry.total}
                  title={`${moduleName(entry.module)} modülü
${entry.labels.join('\n')}`}>
                  {moduleName(entry.module)}<small>{entry.granted}/{entry.total}</small>
                </span>)}
                {!summary.length && <span className="permission-summary">Yetki yok</span>}
              </div>}
          </td>
          <td><Button variant="outline" size="sm" disabled={person.role === 'admin' || busy}
            title={person.role === 'admin' ? 'Yönetici yetkileri değiştirilemez.' : undefined}
            onClick={() => onEdit(person)}>
            <ShieldCheck size={15}/> Yetkileri düzenle
          </Button></td>
        </tr>;
      })}</tbody>
    </table></div>

    <div className="permissions-foot"><LockKeyhole size={14}/> Değişiklikler hemen geçerli olur.</div>

    <PermissionsDialog person={editing} definitions={definitions} busy={busy} error={error}
      onClose={() => setEditing(null)}
      onSubmit={(permissions, person) => void run(async () => {
        setPeople(await api<User[]>(`permissions/${person.id}`, 'PATCH', {permissions}));
        setEditing(null);
      })}/>
  </div>;
}
