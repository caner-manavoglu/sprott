import { useEffect, useState } from 'react';
import { Boxes, LockKeyhole, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../api';
import { Button } from '../components/ui';
import { PageActions } from '../components/page-actions';
import { ConfirmDialog, type Confirmation } from '../components/dialogs/confirm-dialog';
import { GroupDialog, type GroupDraft } from '../components/dialogs/group-dialog';
import { useAsync } from '../lib/use-async';
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

function GroupsPage({groups, busy, canUpdate, canDelete, onEdit, onDelete}: Props) {
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

/** Gruplar ekranı: liste, aday kişiler, ekleme/düzenleme ve silme onayı. */
export function GroupsView({canCreate, canUpdate, canDelete}: {canCreate: boolean; canUpdate: boolean; canDelete: boolean}) {
  const {busy, error, setError, run} = useAsync();
  const [groups, setGroups] = useState<Group[]>([]);
  const [candidates, setCandidates] = useState<Member[]>([]);
  const [draft, setDraft] = useState<GroupDraft | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  useEffect(() => {
    void run(async () => {
      const [list, pool] = await Promise.all([api<Group[]>('groups'), api<Member[]>('groups/members')]);
      setGroups(list);
      setCandidates(pool);
    });
  }, []);

  return <>
    {canCreate && <PageActions>
      <Button onClick={() => {setError(''); setDraft('new');}}><Plus size={17}/> Grup ekle</Button>
    </PageActions>}
    {!draft && !confirmation && error && <div className="page-error error" role="alert">{error}</div>}
    <GroupsPage groups={groups} busy={busy} canUpdate={canUpdate} canDelete={canDelete}
      onEdit={group => {setError(''); setDraft(group);}}
      onDelete={group => {setError(''); setConfirmation({
        title: 'Grubu sil',
        description: `${group.name} grubu silinecek; üyelikler ve yöneticilikler kaldırılacak.`,
        confirmLabel: 'sil', destructive: true,
        action: () => run(async () => setGroups(await api<Group[]>(`groups/${group.id}`, 'DELETE'))),
      });}}/>
    <GroupDialog draft={draft} candidates={candidates} busy={busy} error={error}
      onClose={() => setDraft(null)}
      onSubmit={(values, editing) => void run(async () => {
        setGroups(await api<Group[]>(editing ? `groups/${editing.id}` : 'groups', editing ? 'PATCH' : 'POST', values));
        setDraft(null);
      })}/>
    <ConfirmDialog request={confirmation} busy={busy} error={error}
      onClose={() => setConfirmation(null)} onDone={() => setConfirmation(null)}/>
  </>;
}
