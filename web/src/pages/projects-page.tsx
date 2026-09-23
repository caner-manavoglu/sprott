import { useState } from 'react';
import { ArrowRight, CheckCircle2, FolderKanban, Pencil, Plus, RotateCcw, Trash2, Users } from 'lucide-react';
import { api } from '../api';
import { Button } from '../components/ui';
import { PageActions } from '../components/page-actions';
import { ConfirmDialog, type Confirmation } from '../components/dialogs/confirm-dialog';
import { ProjectDialog, ProjectMembersDialog, type ProjectDraft } from '../components/dialogs/project-dialogs';
import { dateLabel } from '../lib/format';
import { useAsync } from '../lib/use-async';
import { navigate, paths } from '../routes';
import type { Project, User } from '../lib/types';

type Actions = {
  projects: Project[]; busy: boolean;
  canUpdate: boolean; canDelete: boolean;
  onOpen: (projectId: number) => void;
  onEdit: (project: Project) => void;
  onMembers: (project: Project) => void;
  onDelete: (project: Project) => void;
  onToggleComplete: (project: Project) => void;
};

function ProjectsPage({projects, busy, canUpdate, canDelete, onOpen, onEdit, onMembers, onDelete, onToggleComplete}: Actions) {
  if (!projects.length) {
    return <div className="empty-panel"><div><FolderKanban size={22}/></div><strong>Henüz proje yok</strong>
      <span>Proje oluşturduğunuzda panosu da hazır sütunlarla açılır.</span></div>;
  }
  return <div className="permissions-panel"><div className="table-scroll"><table>
    <thead><tr><th>Proje</th><th>Başlangıç</th><th>Bitiş</th><th>Sütun</th><th>Task</th><th>Üye</th><th>Aksiyonlar</th></tr></thead>
    <tbody>{projects.map(project => <tr key={project.id}>
      <td><div className="project-cell">
        <strong>{project.name}</strong>
        {project.description && <small>{project.description}</small>}
        {project.completedAt && <span className="person-role done"><CheckCircle2 size={12}/> Tamamlandı · {dateLabel(project.completedAt)}</span>}
      </div></td>
      <td>{project.startDate ? dateLabel(project.startDate) : <span className="permission-summary">—</span>}</td>
      <td>{project.endDate ? dateLabel(project.endDate) : <span className="permission-summary">—</span>}</td>
      <td><span className="task-total">{project.columnCount}</span></td>
      <td><span className="task-total">{project.taskCount}</span></td>
      <td><span className="task-total">{project.memberCount}</span></td>
      <td><div className="row-actions">
        <Button variant="outline" size="sm" disabled={busy} onClick={() => onOpen(project.id)}>Panoya git <ArrowRight size={15}/></Button>
        {canUpdate && <Button variant="outline" size="sm" disabled={busy} onClick={() => onMembers(project)}><Users size={15}/> Üyeler</Button>}
        {canUpdate && <Button variant="outline" size="sm" disabled={busy} onClick={() => onEdit(project)}><Pencil size={15}/> Düzenle</Button>}
        {/* Tamamlanan projenin panosu salt okunur olur; kayıtlar korunur, proje yeniden açılabilir. */}
        {canUpdate && <Button variant="outline" size="sm" disabled={busy} onClick={() => onToggleComplete(project)}
          title={project.completedAt ? 'Panoyu yeniden düzenlenebilir yap' : 'Panoyu salt okunur yap'}>
          {project.completedAt ? <><RotateCcw size={15}/> Yeniden aç</> : <><CheckCircle2 size={15}/> Projeyi tamamla</>}
        </Button>}
        {canDelete && <Button variant="outline" size="sm" disabled={busy} onClick={() => onDelete(project)}><Trash2 size={15}/> Sil</Button>}
      </div></td>
    </tr>)}</tbody>
  </table></div></div>;
}

type ViewProps = {
  projects: Project[];
  can: {create: boolean; update: boolean; delete: boolean};
  /** Liste kenar çubuğu ve özetle paylaşılır; değişince App ortak veriyi tazeler. */
  onChange: (projects: Project[]) => Promise<void>;
};

/** Projeler ekranı: oluşturma/düzenleme, üyeler, tamamlama ve silme onayı. */
export function ProjectsView({projects, can, onChange}: ViewProps) {
  const {busy, error, setError, run} = useAsync();
  const [draft, setDraft] = useState<ProjectDraft | null>(null);
  const [memberProject, setMemberProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<User[]>([]);
  const [everyone, setEveryone] = useState<User[]>([]);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const ask = (request: Confirmation) => {setError(''); setConfirmation(request);};
  const toggleCompletion = (project: Project) => run(async () =>
    onChange(await api<Project[]>(`projects/${project.id}/completion`, 'PATCH', {completed: !project.completedAt})));
  // Üye sayısı listede gösterildiği için üyelik değişince proje listesi de tazelenir.
  const changeMembers = (request: () => Promise<User[]>) => void run(async () => {
    setMembers(await request());
    await onChange(await api<Project[]>('projects'));
  });

  return <>
    {can.create && <PageActions>
      <Button onClick={() => {setError(''); setDraft('new');}}><Plus size={17}/> Proje oluştur</Button>
    </PageActions>}
    {!draft && !memberProject && !confirmation && error && <div className="page-error error" role="alert">{error}</div>}
    <div className="page-body">
      <ProjectsPage projects={projects} busy={busy} canUpdate={can.update} canDelete={can.delete}
        onToggleComplete={project => ask(project.completedAt
          ? {
              title: 'Projeyi yeniden aç',
              description: `${project.name} yeniden düzenlenebilir olacak; panodaki task'lar ve sütunlar tekrar değiştirilebilir.`,
              confirmLabel: 'yeniden aç',
              action: () => toggleCompletion(project),
            }
          : {
              title: 'Projeyi tamamla',
              description: `${project.name} tamamlanacak ve panosunda değişiklik yapılamayacak. Mevcut task'lar, ekler ve yorumlar olduğu gibi korunur.`,
              confirmLabel: 'tamamla',
              action: () => toggleCompletion(project),
            })}
        onOpen={id => navigate(paths.board(id))}
        onEdit={project => {setError(''); setDraft(project);}}
        onDelete={project => ask({
          title: 'Projeyi sil',
          description: `${project.name} projesi ve sütunları silinecek.`,
          confirmLabel: 'sil', destructive: true,
          action: () => run(async () => onChange(await api<Project[]>(`projects/${project.id}`, 'DELETE'))),
        })}
        onMembers={project => void run(async () => {
          const [list, all] = await Promise.all([
            api<User[]>(`projects/${project.id}/members`),
            api<User[]>('users').catch(() => [] as User[]),
          ]);
          setMembers(list);
          setEveryone(all);
          setMemberProject(project);
        })}/>
    </div>
    <ProjectDialog draft={draft} busy={busy} error={error}
      onClose={() => setDraft(null)}
      onSubmit={(values, editing) => void run(async () => {
        await onChange(await api<Project[]>(editing ? `projects/${editing.id}` : 'projects', editing ? 'PATCH' : 'POST', values));
        setDraft(null);
      })}/>
    <ProjectMembersDialog project={memberProject} members={members} everyone={everyone} busy={busy} error={error}
      onClose={() => setMemberProject(null)}
      onAdd={person => changeMembers(() => api<User[]>(`projects/${memberProject!.id}/members`, 'POST', {userId: person.id}))}
      onRemove={person => changeMembers(() => api<User[]>(`projects/${memberProject!.id}/members/${person.id}`, 'DELETE'))}/>
    <ConfirmDialog request={confirmation} busy={busy} error={error}
      onClose={() => setConfirmation(null)} onDone={() => setConfirmation(null)}/>
  </>;
}
