import { useEffect, useState } from 'react';
import { LockKeyhole, Pencil, Trash2, UserCog, UserPlus, Users } from 'lucide-react';
import { api } from '../api';
import { Button, Input } from '../components/ui';
import { PageActions } from '../components/page-actions';
import { ConfirmDialog, type Confirmation } from '../components/dialogs/confirm-dialog';
import { UserDialog, type UserDraft } from '../components/dialogs/user-dialog';
import { useAsync } from '../lib/use-async';
import { fullName, roleLabel } from '../lib/format';
import type { User } from '../lib/types';
import { Avatar } from '../components/avatar';

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

function UsersPage({users, currentUser, search, busy, canUpdate, canDelete, onSearch, onEdit, onDelete}: Props) {
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
            <Avatar person={person}/>
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

/** Kullanıcılar ekranı: liste, sunucu taraflı arama, ekleme/düzenleme ve silme onayı. */
export function UsersView({currentUser, canCreate, canUpdate, canDelete}: {currentUser: User; canCreate: boolean; canUpdate: boolean; canDelete: boolean}) {
  const {busy, error, setError, run} = useAsync();
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<UserDraft | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  // Arama sunucuya bırakılır; uç ILIKE ile ad, soyad ve e-postada arar. İlk yükleme de bu yoldan geçer.
  useEffect(() => {
    const timer = setTimeout(() => {
      api<User[]>(`users?search=${encodeURIComponent(search.trim())}`).then(setUsers).catch(err => setError((err as Error).message));
    }, search ? 200 : 0);
    return () => clearTimeout(timer);
  }, [search]);

  return <>
    {canCreate && <PageActions>
      <Button onClick={() => {setError(''); setDraft('new');}}><UserPlus size={17}/> Kullanıcı ekle</Button>
    </PageActions>}
    {!draft && !confirmation && error && <div className="page-error error" role="alert">{error}</div>}
    <UsersPage users={users} currentUser={currentUser} search={search} busy={busy}
      canUpdate={canUpdate} canDelete={canDelete}
      onSearch={setSearch}
      onEdit={person => {setError(''); setDraft(person);}}
      onDelete={person => {setError(''); setConfirmation({
        title: 'Kullanıcıyı sil',
        description: `${person.name} ${person.surname} hesabı silinecek.`,
        confirmLabel: 'sil', destructive: true,
        action: () => run(async () => setUsers(await api<User[]>(`users/${person.id}`, 'DELETE'))),
      });}}/>
    <UserDialog draft={draft} busy={busy} error={error}
      onClose={() => setDraft(null)}
      onSubmit={(values, editing) => void run(async () => {
        setUsers(await api<User[]>(editing ? `users/${editing.id}` : 'users', editing ? 'PATCH' : 'POST', values));
        setDraft(null);
      })}/>
    <ConfirmDialog request={confirmation} busy={busy} error={error}
      onClose={() => setConfirmation(null)} onDone={() => setConfirmation(null)}/>
  </>;
}
