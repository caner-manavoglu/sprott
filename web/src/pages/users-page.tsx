import { LockKeyhole, Pencil, Trash2, UserCog, UserPlus, Users } from 'lucide-react';
import { Button, Input } from '../components/ui';
import { fullName, roleLabel } from '../lib/format';
import type { User } from '../lib/types';

type Props = {
  users: User[];
  currentUser: User;
  search: string;
  busy: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onSearch: (value: string) => void;
  onEdit: (person: User) => void;
  onDelete: (person: User) => void;
};

export function UsersPage({users, currentUser, search, busy, canUpdate, canDelete, onSearch, onEdit, onDelete}: Props) {
  return <div className="permissions-panel">
    <div className="permissions-heading">
      <div className="permission-icon"><Users size={21}/></div>
      <div><h2>Ekip üyeleri</h2><p>Oluşturulan kullanıcılar buradaki e-posta ve şifre ile giriş yapar.</p></div>
      <Input className="heading-search" value={search} placeholder="Ad veya soyadla ara…" aria-label="Kullanıcı ara"
        onChange={event => onSearch(event.target.value)}/>
    </div>

    <div className="table-scroll"><table>
      <thead><tr><th>Kullanıcı</th><th>Ünvan</th><th>E-posta</th><th>Rol</th><th>Aksiyonlar</th></tr></thead>
      <tbody>
        {users.map(person => <tr key={person.id}>
          <td><div className="person">
            <span className="user-avatar">{person.name[0]}</span>
            <div><strong>{fullName(person)}</strong><small>{person.title}</small></div>
          </div></td>
          <td>{person.title}</td>
          <td>{person.email}</td>
          <td><div className="role-stack">
            <span className={`person-role ${person.role}`}>{roleLabel(person.role)}</span>
            {/* Grup yöneticiliği gruplar modülünden gelir; yönetici eklenip çıkarıldıkça etiket kendiliğinden değişir. */}
            {!!person.managedGroups?.length && <>
              <span className="person-role manager" title={`Yönettiği gruplar: ${person.managedGroups.join(', ')}`}>
                <UserCog size={12}/> Grup yöneticisi
              </span>
              <small className="managed-groups">{person.managedGroups.join(', ')}</small>
            </>}
          </div></td>
          <td><div className="row-actions">
            <Button variant="outline" size="sm" disabled={!canUpdate || busy} onClick={() => onEdit(person)}>
              <Pencil size={15}/> Düzenle
            </Button>
            <Button variant="ghost" size="icon" aria-label={`${fullName(person)} kullanıcısını sil`}
              disabled={!canDelete || busy || person.role === 'admin' || person.id === currentUser.id}
              title={person.role === 'admin' ? 'Yönetici hesabı silinemez.' : undefined}
              onClick={() => onDelete(person)}>
              <Trash2 size={16}/>
            </Button>
          </div></td>
        </tr>)}
        {!users.length && <tr><td colSpan={5} className="muted">
          {search.trim() ? 'Eşleşen kullanıcı yok.' : 'Henüz kullanıcı yok.'}
        </td></tr>}
      </tbody>
    </table></div>

    <div className="permissions-foot">
      <LockKeyhole size={14}/> Şifreler yalnızca özet olarak saklanır; düzenlerken boş bırakılırsa değişmez.
    </div>
  </div>;
}

/** Sayfa başlığındaki "Kullanıcı ekle" düğmesi. */
export function AddUserButton({onClick}: {onClick: () => void}) {
  return <Button onClick={onClick}><UserPlus size={17}/> Kullanıcı ekle</Button>;
}
