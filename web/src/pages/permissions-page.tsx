import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { Button } from '../components/ui';
import { fullName, roleLabel } from '../lib/format';
import type { Definition, User } from '../lib/types';

type Props = {
  people: User[];
  definitions: Definition[];
  busy: boolean;
  onEdit: (person: User) => void;
};

export function PermissionsPage({people, definitions, busy, onEdit}: Props) {
  return <div className="permissions-panel">
    <div className="permissions-heading">
      <div className="permission-icon"><ShieldCheck size={21}/></div>
      <div><h2>Modül yetkileri</h2><p>Yöneticiler tüm yetkilere sahiptir; personel yetkilerini buradan düzenleyin.</p></div>
    </div>

    <div className="table-scroll"><table>
      <thead><tr><th>Kullanıcı</th><th>Rol</th><th>Yetkiler</th><th>Aksiyonlar</th></tr></thead>
      <tbody>{people.map(person => {
        const granted = definitions.filter(definition => person.permissions?.[definition.key]);
        return <tr key={person.id}>
          <td><div className="person">
            <span className="user-avatar">{person.name[0]}</span>
            <div><strong>{fullName(person)}</strong><small>{person.email}</small></div>
          </div></td>
          <td><span className={`person-role ${person.role}`}>{roleLabel(person.role)}</span></td>
          <td>{person.role === 'admin'
            ? <span className="permission-summary">Tüm yetkiler</span>
            : <div className="permission-tags">
                {granted.map(definition => <span className="permission-tag" key={definition.key}>{definition.label}</span>)}
                {!granted.length && <span className="permission-summary">Yetki yok</span>}
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
  </div>;
}
