import { Boxes, LockKeyhole, Pencil, Trash2 } from 'lucide-react';
import { Button } from '../components/ui';
import { fullName } from '../lib/format';
import type { Group, Member } from '../lib/types';

type Props = {
  groups: Group[];
  busy: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onEdit: (group: Group) => void;
  onDelete: (group: Group) => void;
};

const tags = (people: Member[], empty: string) =>
  <div className="permission-tags">
    {people.map(person => <span className="permission-tag" key={person.id}>{fullName(person)}</span>)}
    {!people.length && <span className="permission-summary">{empty}</span>}
  </div>;

export function GroupsPage({groups, busy, canUpdate, canDelete, onEdit, onDelete}: Props) {
  return <div className="permissions-panel">
    <div className="permissions-heading">
      <div className="permission-icon"><Boxes size={21}/></div>
      <div><h2>Kullanıcı grupları</h2><p>Frontend, fullstack gibi gruplar oluşturup üyelerini seçin.</p></div>
    </div>

    <div className="table-scroll"><table>
      <thead><tr><th>Grup</th><th>Üyeler</th><th>Grup yöneticileri</th><th>Üye sayısı</th><th>Aksiyonlar</th></tr></thead>
      <tbody>
        {groups.map(group => <tr key={group.id}>
          <td><strong>{group.name}</strong></td>
          <td>{tags(group.members, 'Üye yok')}</td>
          <td>{tags(group.managers, 'Yönetici yok')}</td>
          <td>{group.members.length}</td>
          <td><div className="row-actions">
            <Button variant="outline" size="sm" disabled={!canUpdate || busy} onClick={() => onEdit(group)}><Pencil size={15}/> Düzenle</Button>
            <Button variant="ghost" size="icon" aria-label={`${group.name} grubunu sil`} disabled={!canDelete || busy} onClick={() => onDelete(group)}>
              <Trash2 size={16}/>
            </Button>
          </div></td>
        </tr>)}
        {!groups.length && <tr><td colSpan={5} className="muted">Henüz grup yok.</td></tr>}
      </tbody>
    </table></div>

    <div className="permissions-foot">
      <LockKeyhole size={14}/> Bir kullanıcı istediğiniz kadar gruba eklenebilir; grup yöneticileri üyelerin task’larını panoda geri alabilir.
    </div>
  </div>;
}
