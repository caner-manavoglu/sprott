import { BarChart3, Bell, Boxes, ChevronDown, CircleUserRound, FolderKanban, GitPullRequest, Home, ListChecks, LogOut, Megaphone, MessageCircle, ScrollText, ShieldCheck, Users } from 'lucide-react';
import { useState } from 'react';
import { Plug } from 'lucide-react';
import { McpDialog } from './dialogs/mcp-dialog';
import { Brand } from './brand';
import { navigate, paths } from '../routes';
import type { PageKey } from '../routes';
import { allowed, fullName, roleLabel } from '../lib/format';
import type { Board, Project, User } from '../lib/types';
import { Avatar } from './avatar';

type Permissions = {projects: boolean; users: boolean; groups: boolean; logs: boolean; prs: boolean; admin: boolean};

type Props = {
  open: boolean;
  user: User;
  page: PageKey;
  board: Board;
  projects: Project[];
  can: Permissions;
  /** Okunmamış bildirim sayısı; bağlantıdaki rozette 9’dan fazlası "9+" olur. */
  unread: number;
  busy: boolean;
  projectsOpen: boolean;
  onToggleProjects: () => void;
  onLogout: () => void;
};

/** Sol gezinme: sayfa bağlantıları ve açılır proje listesi. */
export function Sidebar({open, user, page, board, projects, can, unread, busy, projectsOpen, onToggleProjects, onLogout}: Props) {
  const [mcpOpen, setMcpOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const link = (target: PageKey, path: string, icon: React.ReactNode, label: string) =>
    <button className={page === target ? 'active' : ''} onClick={() => navigate(path)}>{icon} {label}</button>;

  return <><aside id="sidebar" className="sidebar" aria-hidden={!open} inert={!open}>
    <Brand/>
    <div className="workspace">
      <div className="workspace-icon">Ç</div>
      <div><strong>Çalışma alanı</strong><small>Ekip panosu</small></div>
    </div>
    <span className="nav-label">ÇALIŞMA ALANI</span>
    <nav>
      {link('dashboard', paths.dashboard, <Home size={18}/>, 'Özet')}
      {link('myTasks', paths.myTasks, <ListChecks size={18}/>, 'İşlerim')}
      {allowed(user, 'forum.view') && link('forums', paths.forums, <MessageCircle size={18}/>, 'Forum / Toplantı Notları')}

      {can.projects && <>
        <div className="nav-row">
          <button className={page === 'projects' ? 'active' : page === 'board' ? 'open' : ''} onClick={() => navigate(paths.projects)}>
            <FolderKanban size={18}/>
            <span className="nav-stack">
              <span>Projeler</span>
              {page === 'board' && board.project && !projectsOpen && <small>{board.project.name}</small>}
            </span>
          </button>
          <button type="button" className="nav-toggle" aria-expanded={projectsOpen}
            aria-label={projectsOpen ? 'Proje listesini gizle' : 'Proje listesini göster'}
            title={projectsOpen ? 'Listeyi gizle' : 'Listeyi göster'} onClick={onToggleProjects}>
            <ChevronDown size={15}/>
          </button>
        </div>
        <div className="reveal" data-open={projectsOpen && !!projects.length} inert={!projectsOpen}><div><div className="nav-sub">
          {projects.map(project => <button key={project.id} title={`${project.name} panosu`}
            className={page === 'board' && board.project?.id === project.id ? 'active' : ''}
            onClick={() => navigate(paths.board(project.id))}>
            <span className="nav-sub-dot"/><span>{project.name}</span>
          </button>)}
        </div></div></div>
      </>}

      {can.admin && link('permissions', paths.permissions, <ShieldCheck size={18}/>, 'Yetkiler')}
      {can.users && link('users', paths.users, <Users size={18}/>, 'Kullanıcılar')}
      {can.groups && link('groups', paths.groups, <Boxes size={18}/>, 'Gruplar')}
      {link('reports', paths.reports, <BarChart3 size={18}/>, 'Raporlar')}
      {link('announcements', paths.announcements, <Megaphone size={18}/>, 'Duyurular')}
      {can.prs && link('pullRequests', paths.pullRequests, <GitPullRequest size={18}/>, 'PR’lar')}
      {can.logs && link('logs', paths.logs, <ScrollText size={18}/>, 'Loglar')}
      <button className={page === 'notifications' ? 'active' : ''} onClick={() => navigate(paths.notifications)}>
        <Bell size={18}/> Bildirimler
        {!!unread && <span className="nav-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      <button type="button" aria-label="MCP bağlantısı" title="MCP bağlantısı" aria-haspopup="dialog" aria-expanded={mcpOpen} onClick={() => setMcpOpen(true)}><Plug size={18}/> MCP bağlantısı</button>
    </nav>
    <div className="sidebar-bottom">
      <div className="account-menu">
        {accountOpen && <div className="account-popover">
          <button type="button" onClick={() => {setAccountOpen(false); navigate(paths.profile);}}><CircleUserRound size={17}/> Profil</button>
          <button type="button" disabled={busy} onClick={onLogout}><LogOut size={17}/> Çıkış yap</button>
        </div>}
        <button type="button" className="profile-link" aria-label="Hesap menüsünü aç" aria-expanded={accountOpen}
          onClick={() => setAccountOpen(value => !value)}><Avatar person={user}/>
          <span className="user-info"><strong>{fullName(user)}</strong><small>{user.title || roleLabel(user.role)}</small></span>
          <ChevronDown className="account-chevron" size={16}/>
        </button>
      </div>
    </div>
  </aside>{mcpOpen && <McpDialog onClose={() => setMcpOpen(false)}/>}</>;
}
