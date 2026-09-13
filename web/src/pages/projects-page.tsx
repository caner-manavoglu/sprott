import { ArrowRight, CheckCircle2, FolderKanban, Pencil, RotateCcw, Trash2, Users } from 'lucide-react';
import { Button } from '../components/ui';
import { dateLabel } from '../lib/format';
import type { Project } from '../lib/types';

type Actions = {
  projects: Project[]; busy: boolean;
  canUpdate: boolean; canDelete: boolean;
  onOpen: (projectId: number) => void;
  onEdit: (project: Project) => void;
  onMembers: (project: Project) => void;
  onDelete: (project: Project) => void;
  onToggleComplete: (project: Project) => void;
};

export function ProjectsPage({projects, busy, canUpdate, canDelete, onOpen, onEdit, onMembers, onDelete, onToggleComplete}: Actions) {
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
