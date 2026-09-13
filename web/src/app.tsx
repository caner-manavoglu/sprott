import { useEffect, useState } from 'react';
import { ChevronRight, Columns3, GitBranch, Moon, PanelLeftClose, PanelLeftOpen, Plus, Sun } from 'lucide-react';
import { api, authToken, fileBody, setToken } from './api';
import { Brand } from './components/brand';
import { Login } from './components/login';
import { Sidebar } from './components/sidebar';
import { subscribeLive } from './lib/live';
import { NotificationBell } from './components/notifications';
import { TaskSearch } from './components/task-search';
import { AnnouncementPopup } from './components/announcement';
import { Button } from './components/ui';
import { ColumnsDialog } from './components/dialogs/columns-dialog';
import { GroupDialog, type GroupDraft } from './components/dialogs/group-dialog';
import { NewTaskDialog, TaskDetailDialog } from './components/dialogs/task-dialog';
import { PullRequestsPage } from './pages/pull-requests-page';
import { PullRequestDialog, type PullRequestDraft } from './components/dialogs/pull-request-dialog';
import { PrWarningDialog } from './components/dialogs/pr-warning-dialog';
import { PermissionsDialog } from './components/dialogs/permissions-dialog';
import { WorkflowDialog } from './components/dialogs/workflow-dialog';
import { ProjectDialog, ProjectMembersDialog, type ProjectDraft } from './components/dialogs/project-dialogs';
import { ConfirmDialog, type Confirmation } from './components/dialogs/confirm-dialog';
import { UserDialog, type UserDraft } from './components/dialogs/user-dialog';
import { BoardPage } from './pages/board-page';
import { DashboardPage } from './pages/dashboard-page';
import { GroupsPage } from './pages/groups-page';
import { PermissionsPage } from './pages/permissions-page';
import { ProjectsPage } from './pages/projects-page';
import { LogsPage } from './pages/logs-page';
import { ReportDetailPage, ReportsPage } from './pages/reports-page';
import { AddUserButton, UsersPage } from './pages/users-page';
import { NotificationsPage } from './pages/notifications-page';
import { AnnouncementReportPage, AnnouncementsPage } from './pages/announcements-page';
import { AnnouncementDialog, type AnnouncementDraft } from './components/dialogs/announcement-dialog';
import { allowed, roleLabel } from './lib/format';
import { useAsync } from './lib/use-async';
import { emptyBoard, emptyPullRequests, emptyFeed } from './lib/types';
import type { ActivityLog, Announcement, AnnouncementDetail, Board, Definition, Group, Member, Notification, NotificationFeed, LinkableTask, OverdueTask, PrState, Project, PullRequest, PullRequestFeed, Report, ReportDetail, Role, SummaryProject, Task, TaskSearchResult, Transition, User, Workflow } from './lib/types';
import { headingFor, matchRoute, navigate, pageTitles, paths, usePath } from './routes';

export function App() {
  const path = usePath();
  const route = matchRoute(path);
  const {busy, error, setError, run} = useAsync();

  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Sayfa verileri: her sayfa kendi listesini açıldığında yükler.
  const [board, setBoard] = useState<Board>(emptyBoard);
  const [members, setMembers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [summary, setSummary] = useState<SummaryProject[]>([]);
  const [overdue, setOverdue] = useState<OverdueTask[]>([]);
  // Log sayfası: seçili proje ve task filtresi adresten değil yerel durumdan gelir.
  const [log, setLog] = useState<ActivityLog | null>(null);
  const [logProject, setLogProject] = useState<number | null>(null);
  const [logTask, setLogTask] = useState<number | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [people, setPeople] = useState<User[]>([]);
  const [definitions, setDefinitions] = useState<Definition[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [candidates, setCandidates] = useState<Member[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [reportDetail, setReportDetail] = useState<ReportDetail | null>(null);
  const [everyone, setEveryone] = useState<User[]>([]);
  const [feed, setFeed] = useState<NotificationFeed>(emptyFeed);
  const [bellOpen, setBellOpen] = useState(false);
  const [taskSearch, setTaskSearch] = useState('');
  const [taskResults, setTaskResults] = useState<TaskSearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [announcementReport, setAnnouncementReport] = useState<AnnouncementDetail | null>(null);
  // Duyuru yapılabilecek gruplar ve okunmamış zorunlu duyurular oturum boyunca taşınır.
  const [announcementGroups, setAnnouncementGroups] = useState<{id: number; name: string}[]>([]);
  const [announcementDraft, setAnnouncementDraft] = useState<AnnouncementDraft | null>(null);
  const [mandatory, setMandatory] = useState<Announcement[]>([]);

  // Açık modallar.
  const [pullRequests, setPullRequests] = useState<PullRequestFeed>(emptyPullRequests);
  /** PR ekranının proje süzgeci; null "tüm projeler" demektir ve varsayılandır. */
  const [prProject, setPrProject] = useState<number | null>(null);
  const [pullRequestDraft, setPullRequestDraft] = useState<PullRequestDraft | null>(null);
  /** Tamamlandı sütununa taşınırken açık PR uyarısı; onaylanırsa taşıma yapılır. */
  const [prWarning, setPrWarning] = useState<{taskId: number; columnId: number} | null>(null);
  const [taskDraft, setTaskDraft] = useState<number | null>(null);
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [userDraft, setUserDraft] = useState<UserDraft | null>(null);
  const [groupDraft, setGroupDraft] = useState<GroupDraft | null>(null);
  const [projectDraft, setProjectDraft] = useState<ProjectDraft | null>(null);
  const [memberProject, setMemberProject] = useState<Project | null>(null);
  // Geri alınması zor her işlem aynı onay modalından geçer.
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const ask = (request: Confirmation) => {setError(''); setConfirmation(request);};
  const [permissionPerson, setPermissionPerson] = useState<User | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [projectsOpen, setProjectsOpen] = useState(false);

  const isAdmin = user?.role === 'admin';
  // Tamamlanan projenin panosu salt okunur: task ve sütun yazma yetkileri burada kapanır.
  // Sunucu da aynı kuralı uyguluyor; bu yalnızca arayüzü tutarlı tutar.
  const boardLocked = !!board.project?.completedAt;
  const can = {
    viewTasks: allowed(user, 'task.view'),
    createTask: allowed(user, 'task.create') && !boardLocked,
    updateTask: allowed(user, 'task.update') && !boardLocked,
    deleteTask: allowed(user, 'task.delete') && !boardLocked,
    editColumns: allowed(user, 'project.update') && !boardLocked,
    viewProjects: allowed(user, 'project.view'), createProject: allowed(user, 'project.create'),
    updateProject: allowed(user, 'project.update'), deleteProject: allowed(user, 'project.delete'),
    viewUsers: allowed(user, 'user.view'), createUser: allowed(user, 'user.create'),
    updateUser: allowed(user, 'user.update'), deleteUser: allowed(user, 'user.delete'),
    viewLogs: allowed(user, 'log.view'),
    viewPrs: allowed(user, 'pr.view'),
    createPr: allowed(user, 'pr.create'), updatePr: allowed(user, 'pr.update'),
    deletePr: allowed(user, 'pr.delete'), mergePr: allowed(user, 'pr.merge'),
    // Duyuru yetkisi grup yöneticiliğinden türer; sunucu da aynı kuralı uygular.
    createAnnouncement: user?.role === 'admin' || (allowed(user, 'announcement.create') && !!user?.managedGroups?.length),
    viewGroups: allowed(user, 'group.view'), createGroup: allowed(user, 'group.create'),
    updateGroup: allowed(user, 'group.update'), deleteGroup: allowed(user, 'group.delete'),
    // Akış kuralları: ilk tanım 'create', var olanı değiştirmek 'update', kaldırmak 'delete' yetkisiyle.
    viewWorkflow: allowed(user, 'workflow.view'), createWorkflow: allowed(user, 'workflow.create'),
    updateWorkflow: allowed(user, 'workflow.update'), deleteWorkflow: allowed(user, 'workflow.delete'),
  };

  useEffect(() => {
    const theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#121a17' : '#176b52');
    try { localStorage.setItem('sprott-theme', theme); } catch { /* Tema, depolama kapalıyken de çalışır. */ }
  }, [dark]);

  // Kök adres ve tanınmayan yollar özete düşer; adres çubuğu da özetin yolunu gösterir.
  useEffect(() => {
    if (route.page === 'dashboard' && path !== paths.dashboard) navigate(paths.dashboard, {replace: true});
  }, [path]);

  const themeToggle = <Button type="button" variant="outline" size="icon" className="theme-toggle"
    aria-label="Koyu tema" aria-pressed={dark} title={dark ? 'Açık temaya geç' : 'Koyu temaya geç'}
    onClick={() => setDark(value => !value)}>{dark ? <Sun size={17}/> : <Moon size={17}/>}</Button>;

  /** Oturum verisi: kullanıcı, proje listesi ve özet her tazelemede yenilenir. */
  async function refresh() {
    setUser(await api<User>('me'));
    const [list, overview, late, notifications, pending] = await Promise.all([
      api<Project[]>('projects').catch(() => [] as Project[]),
      api<SummaryProject[]>('dashboard'),
      api<OverdueTask[]>('dashboard/overdue'),
      api<NotificationFeed>('notifications'),
      api<Announcement[]>('announcements/pending'),
    ]);
    setProjects(list);
    setSummary(overview);
    setOverdue(late);
    setFeed(notifications);
    setMandatory(pending);
  }

  useEffect(() => {
    const expired = () => {
      setUser(null);
      setBoard(emptyBoard);
      navigate(paths.dashboard);
    };
    window.addEventListener('session-expired', expired);
    (authToken ? refresh() : Promise.resolve())
      .catch(err => {if (!String(err).includes('Lütfen giriş')) setError(err.message);})
      .finally(() => setLoading(false));
    return () => window.removeEventListener('session-expired', expired);
  }, []);

  useEffect(() => {
    if (!user) return;
    const sync = () => {refresh().catch(err => setError(err.message));};
    window.addEventListener('focus', sync);
    return () => window.removeEventListener('focus', sync);
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false, pending = false, rerun = false;
    const sync = async () => {
      if (pending) {rerun = true; return;}
      pending = true;
      try {
        do {
          rerun = false;
          if (route.page === 'board') {
            const next = await api<Board>(`projects/${route.projectId}/board`);
            if (!cancelled) setBoard(next);
          } else if (route.page === 'dashboard') {
            const [overview, late] = await Promise.all([api<SummaryProject[]>('dashboard'), api<OverdueTask[]>('dashboard/overdue')]);
            if (!cancelled) {setSummary(overview); setOverdue(late);}
          }
          const feed = await api<NotificationFeed>('notifications');
          if (!cancelled) setFeed(feed);
        } while (rerun && !cancelled);
      } catch (err) {
        if (!cancelled) {if (route.page === 'board') setBoard(emptyBoard); setError((err as Error).message);}
      } finally {pending = false;}
    };
    const unsubscribe = subscribeLive(() => {void sync();});
    return () => {cancelled = true; unsubscribe();};
  }, [user?.id, path]);

  // Adres değişince o sayfanın verisi çekilir; yenile ve geri/ileri de aynı yoldan geçer.
  useEffect(() => {
    if (!user) return;
    void run(async () => {
      switch (route.page) {
        case 'dashboard': {
          const [overview, late, prFeed, news] = await Promise.all([
            api<SummaryProject[]>('dashboard'),
            api<OverdueTask[]>('dashboard/overdue'),
            api<PullRequestFeed>('pull-requests').catch(() => emptyPullRequests),
            api<Announcement[]>('announcements').catch(() => [] as Announcement[]),
          ]);
          setSummary(overview);
          setOverdue(late);
          setPullRequests(prFeed);
          setAnnouncements(news);
          break;
        }
        case 'projects':
          setProjects(await api<Project[]>('projects'));
          setProjectsOpen(true);
          break;
        case 'board': {
          const [data, projectMembers] = await Promise.all([
            api<Board>(`projects/${route.projectId}/board`),
            api<User[]>(`projects/${route.projectId}/members`).catch(() => [] as User[]),
          ]);
          setBoard(data);
          setMembers(projectMembers);
          setProjectsOpen(true);
          // Bildirimden gelen '/projeler/:id/task/:taskId' yolunda task detayı kendiliğinden açılır.
          if (route.taskId !== null) setOpenTask(data.tasks.find(task => task.id === route.taskId) ?? null);
          break;
        }
        case 'permissions': {
          const [list, keys] = await Promise.all([api<User[]>('permissions'), api<Definition[]>('permissions/definitions')]);
          setPeople(list);
          setDefinitions(keys);
          break;
        }
        case 'users':
          setUsers(await api<User[]>('users'));
          setUserSearch('');
          break;
        case 'groups': {
          const [list, pool] = await Promise.all([api<Group[]>('groups'), api<Member[]>('groups/members')]);
          setGroups(list);
          setCandidates(pool);
          break;
        }
        case 'logs': {
          // Sayfa açılışında filtreler sıfırlanır; sunucu erişilebilen ilk projeyi döndürür.
          const feedLog = await api<ActivityLog>('logs');
          setLog(feedLog);
          setLogProject(feedLog.projectId);
          setLogTask(null);
          break;
        }
        case 'notifications':
          setFeed(await api<NotificationFeed>('notifications'));
          break;
        case 'pullRequests':
          // Sayfa her açılışta tüm projelerle başlar.
          setPrProject(null);
          setPullRequests(await api<PullRequestFeed>('pull-requests'));
          break;
        case 'announcements':
          if (route.announcementId === null) setAnnouncements(await api<Announcement[]>('announcements'));
          else setAnnouncementReport(await api<AnnouncementDetail>(`announcements/${route.announcementId}`));
          break;
        case 'reports':
          if (route.personId === null) setReport(await api<Report>('reports'));
          else setReportDetail(await api<ReportDetail>(`reports/${route.personId}`));
          break;
      }
    });
  }, [user?.id, path]);

  // Kullanıcı listesindeki arama sunucuya bırakılır; uç ILIKE ile ad, soyad ve e-postada arar.
  useEffect(() => {
    if (route.page !== 'users') return;
    const timer = setTimeout(() => {
      api<User[]>(`users?search=${encodeURIComponent(userSearch.trim())}`)
        .then(setUsers)
        .catch(err => setError((err as Error).message));
    }, 200);
    return () => clearTimeout(timer);
  }, [route.page, userSearch]);

  // Üst çubuktaki task araması da kullanıcı aramasıyla aynı yolu izler: gecikmeli istek, sunucuda ILIKE.
  useEffect(() => {
    const term = taskSearch.trim();
    if (term.length < 2) { setTaskResults([]); return; }
    const timer = setTimeout(() => {
      api<TaskSearchResult[]>(`tasks?q=${encodeURIComponent(term)}`)
        .then(results => { setTaskResults(results); setSearchOpen(true); })
        .catch(() => setTaskResults([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [taskSearch]);

  if (loading) return <div className="loading"><Brand/><p>Çalışma alanı yükleniyor…</p></div>;

  if (!user) return <Login busy={busy} error={error} themeToggle={themeToggle} onRoleChange={() => setError('')}
    onSubmit={credentials => void run(async () => {
      const me = await api<User & {token: string}>('login', 'POST', credentials as {email: string; password: string; role: Role});
      setToken(me.token);
      setUser(me);
      navigate(paths.dashboard);
      const [list, overview, late, notifications, pending] = await Promise.all([
        api<Project[]>('projects').catch(() => [] as Project[]),
        api<SummaryProject[]>('dashboard'),
        api<OverdueTask[]>('dashboard/overdue'),
        api<NotificationFeed>('notifications'),
        api<Announcement[]>('announcements/pending'),
      ]);
      setProjects(list);
      setSummary(overview);
      setOverdue(late);
      setFeed(notifications);
      setMandatory(pending);
    })}/>;

  const heading = headingFor(route, board);

  /** Sayfa başlığındaki sağ taraftaki eylemler sayfaya göre değişir. */
  const headerActions = <>
    {route.page === 'projects' && can.createProject && <Button onClick={() => {setError(''); setProjectDraft('new');}}>
      <Plus size={17}/> Proje oluştur
    </Button>}
    {route.page === 'board' && <>
      {can.editColumns && <Button variant="outline" onClick={() => {setError(''); setColumnsOpen(true);}}>
        <Columns3 size={16}/> Sütunları düzenle
      </Button>}
      {can.viewWorkflow && <Button variant="outline" onClick={() => {setError(''); setWorkflowOpen(true);}}>
        <GitBranch size={16}/> Akış kuralları
      </Button>}
      {can.createTask && <Button disabled={!board.columns.length} onClick={() => {setError(''); setTaskDraft(board.columns[0]?.id ?? 0);}}>
        <Plus size={17}/> Task oluştur
      </Button>}
    </>}
    {route.page === 'announcements' && can.createAnnouncement && <Button onClick={() => void run(async () => {
      setError('');
      setAnnouncementGroups(await api<{id: number; name: string}[]>('announcements/groups'));
      setAnnouncementDraft('new');
    })}>
      <Plus size={17}/> Duyuru oluştur
    </Button>}
    {route.page === 'users' && can.createUser && <AddUserButton onClick={() => {setError(''); setUserDraft('new');}}/>}
    {route.page === 'groups' && can.createGroup && <Button onClick={() => {setError(''); setGroupDraft('new');}}>
      <Plus size={17}/> Grup ekle
    </Button>}
  </>;

  /** Bildirime tıklamak: okundu işaretler ve ilgili task'ı panoda açar. */
  const openNotification = (item: Notification) => void run(async () => {
    setFeed(await api<NotificationFeed>(`notifications/${item.id}/read`, 'PATCH'));
    // Duyuru bildirimi okundu işaretlendiğinde duyuru da okunmuş sayılır; modal listesi tazelenir.
    if (item.announcementId !== null) {
      setMandatory(await api<Announcement[]>('announcements/pending'));
      navigate(paths.announcements);
      return;
    }
    navigate(paths.boardTask(item.projectId!, item.taskId!));
  });

  /** Son sütun "tamamlandı" sayılır; gecikme ve rapor tanımıyla aynı kural. */
  const isFinalColumn = (columnId: number) => board.columns[board.columns.length - 1]?.id === columnId;

  const moveTask = (taskId: number, columnId: number) => void run(async () => {
    setBoard(await api<Board>(`tasks/${taskId}`, 'PATCH', {columnId}));
    setOpenTask(null);
    setPrWarning(null);
  });

  /**
   * Taşıma kapısı: task tamamlandı sütununa gidiyorsa ve açık PR'ı varsa önce uyarı çıkar.
   * Engelleme yoktur; kullanıcı onaylarsa taşınır ve sunucu günlüğe "açık PR" notunu düşer.
   */
  const requestMove = (taskId: number, columnId: number) => {
    const task = board.tasks.find(item => item.id === taskId);
    const openPrs = task?.pullRequests.filter(pullRequest => pullRequest.state === 'open') ?? [];
    if (openPrs.length && isFinalColumn(columnId) && task!.columnId !== columnId) {
      setError('');
      setPrWarning({taskId, columnId});
      return;
    }
    moveTask(taskId, columnId);
  };

  /** PR ekranının verisini tazeler; pano açıksa kartlardaki rozet de güncellenir. */
  /** Yazma uçlarına eklenen süzgeç; yanıt ekrandaki görünümle aynı kapsamda döner. */
  const prView = () => (prProject === null ? '' : `?view=${prProject}`);

  const reloadPullRequests = async (feed: PullRequestFeed) => {
    setPullRequests(feed);
    if (route.page === 'board') setBoard(await api<Board>(`projects/${route.projectId}/board`));
  };

  const reloadBoard = async () => {
    if (route.page === 'board') setBoard(await api<Board>(`projects/${route.projectId}/board`));
  };

  /** Task detayındaki silmeler panoyu ve açık task'ı aynı yanıttan tazeler. */
  const reloadTask = (path: string, method = 'DELETE') => run(async () => {
    const next = await api<Board>(path, method);
    setBoard(next);
    setOpenTask(next.tasks.find(item => item.id === openTask!.id) ?? null);
  });

  const toggleCompletion = (project: Project) => run(async () => {
    setProjects(await api<Project[]>(`projects/${project.id}/completion`, 'PATCH', {completed: !project.completedAt}));
    if (board.project?.id === project.id) setBoard(await api<Board>(`projects/${project.id}/board`));
  });

  // Onay metninde dosya adı geçsin diye açık task üzerinden aranır.
  const attachmentName = (attachmentId: number) =>
    openTask?.attachments?.find(item => item.id === attachmentId)?.name ?? 'Dosya';
  const commentAttachmentName = (commentId: number, attachmentId: number) =>
    openTask?.comments?.find(item => item.id === commentId)?.attachments
      .find(item => item.id === attachmentId)?.name ?? 'Dosya';

  return <div className={`app-shell${sidebarOpen ? '' : ' sidebar-closed'}`}>
    <Sidebar open={sidebarOpen} user={user} page={route.page} board={board} projects={projects} busy={busy} projectsOpen={projectsOpen} unread={feed.unread}
      can={{projects: can.viewProjects, users: can.viewUsers, groups: can.viewGroups, logs: can.viewLogs, prs: can.viewPrs, admin: !!isAdmin}}
      onToggleProjects={() => setProjectsOpen(open => !open)}
      onLogout={() => void run(async () => {
        await api('logout', 'POST');
        setToken('');
        setUser(null);
        setBoard(emptyBoard);
        setFeed(emptyFeed);
        navigate(paths.dashboard);
      })}/>

    {/* `key` sayfa değişince içeriği yeniden bağlar; böylece giriş animasyonu her geçişte çalışır. */}
    <main className="main-content" key={route.page}>
      <header className="topbar">
        <div>
          <button type="button" className="sidebar-toggle" aria-label={`Kenar çubuğunu ${sidebarOpen ? 'kapat' : 'aç'}`}
            aria-controls="sidebar" aria-expanded={sidebarOpen} title={`Kenar çubuğunu ${sidebarOpen ? 'kapat' : 'aç'}`}
            onClick={() => setSidebarOpen(open => !open)}>{sidebarOpen ? <PanelLeftClose size={17}/> : <PanelLeftOpen size={17}/>}</button>
          Çalışma alanı <ChevronRight size={14}/><span>{pageTitles[route.page].crumb}</span>
        </div>
        <div className="topbar-actions">
          {can.viewTasks && <TaskSearch value={taskSearch} results={taskResults} open={searchOpen}
            onChange={value => {setTaskSearch(value); setSearchOpen(true);}}
            onClose={() => setSearchOpen(false)}
            onOpenTask={item => {setSearchOpen(false); setTaskSearch(''); navigate(paths.boardTask(item.projectId, item.id));}}/>}
          <NotificationBell feed={feed} open={bellOpen}
            onToggle={() => setBellOpen(open => !open)}
            onClose={() => setBellOpen(false)}
            onOpen={item => void run(async () => setFeed(await api<NotificationFeed>(`notifications/${item.id}/read`, 'PATCH')))}
            onReadAll={() => void run(async () => setFeed(await api<NotificationFeed>('notifications/read', 'PATCH')))}
            onSeeAll={() => {setBellOpen(false); navigate(paths.notifications);}}/>
          <span className="role-pill"><span/>{roleLabel(user.role)} hesabı</span>
          {themeToggle}
        </div>
      </header>

      <section className="page-header">
        <div>
          <div className="eyebrow">{heading.eyebrow}</div>
          <h1>{heading.heading}</h1>
          <p className="muted">{heading.description}</p>
        </div>
        <div className="header-actions">{headerActions}</div>
      </section>

      {error && <div className="page-error error" role="alert">{error}</div>}

      {route.page === 'dashboard' && <div className="page-body">
        <DashboardPage summary={summary} overdue={overdue} isAdmin={!!isAdmin}
          openPrs={pullRequests.rows.filter(row => row.state === 'open')} announcements={announcements}
          onOpen={id => navigate(paths.board(id))}/>
      </div>}

      {route.page === 'projects' && <div className="page-body">
        <ProjectsPage projects={projects} busy={busy} canUpdate={can.updateProject} canDelete={can.deleteProject}
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
          onEdit={project => {setError(''); setProjectDraft(project);}}
          onDelete={project => ask({
            title: 'Projeyi sil',
            description: `${project.name} projesi ve sütunları silinecek.`,
            confirmLabel: 'sil', destructive: true,
            action: () => run(async () => {
              setProjects(await api<Project[]>(`projects/${project.id}`, 'DELETE'));
              setSummary(await api<SummaryProject[]>('dashboard'));
              if (board.project?.id === project.id) {
                setBoard(emptyBoard);
                navigate(paths.projects);
              }
            }),
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
      </div>}

      {route.page === 'board' && <BoardPage board={board} members={members} busy={busy} locked={boardLocked}
        canCreate={can.createTask} canUpdate={can.updateTask} isAdmin={!!isAdmin}
        onAddTask={columnId => {setError(''); setTaskDraft(columnId);}}
        onOpenTask={task => {setError(''); setOpenTask(task);}}
        onMove={requestMove}/>}

      {route.page === 'permissions' && <PermissionsPage people={people} definitions={definitions} busy={busy}
        onEdit={person => {setError(''); setPermissionPerson(person);}}/>}

      {route.page === 'users' && <UsersPage users={users} currentUser={user} search={userSearch} busy={busy}
        canUpdate={can.updateUser} canDelete={can.deleteUser}
        onSearch={setUserSearch}
        onEdit={person => {setError(''); setUserDraft(person);}}
        onDelete={person => ask({
          title: 'Kullanıcıyı sil',
          description: `${person.name} ${person.surname} hesabı silinecek.`,
          confirmLabel: 'sil', destructive: true,
          action: () => run(async () => setUsers(await api<User[]>(`users/${person.id}`, 'DELETE'))),
        })}/>}

      {route.page === 'groups' && <GroupsPage groups={groups} busy={busy}
        canUpdate={can.updateGroup} canDelete={can.deleteGroup}
        onEdit={group => {setError(''); setGroupDraft(group);}}
        onDelete={group => ask({
          title: 'Grubu sil',
          description: `${group.name} grubu silinecek; üyelikler ve yöneticilikler kaldırılacak.`,
          confirmLabel: 'sil', destructive: true,
          action: () => run(async () => setGroups(await api<Group[]>(`groups/${group.id}`, 'DELETE'))),
        })}/>}

      {route.page === 'pullRequests' && <div className="page-body">
        <PullRequestsPage feed={pullRequests} busy={busy}
          canCreate={can.createPr} canUpdate={can.updatePr} canDelete={can.deletePr} canMerge={can.mergePr}
          onProject={projectId => void run(async () => {
            setPrProject(projectId);
            setPullRequests(await api<PullRequestFeed>(
              projectId === null ? 'pull-requests' : `pull-requests?projectId=${projectId}`));
          })}
          onNew={() => {setError(''); setPullRequestDraft('new');}}
          onEdit={pullRequest => {setError(''); setPullRequestDraft(pullRequest);}}
          onState={(pullRequest, state) => void run(async () =>
            reloadPullRequests(await api<PullRequestFeed>(`pull-requests/${pullRequest.id}/state${prView()}`, 'PATCH', {state})))}
          onDelete={pullRequest => setConfirmation({
            title: 'PR silinsin mi?',
            description: `“${pullRequest.title}” kaydı ve task bağları silinecek. Pull request’in kendisi GitHub’da kalır.`,
            confirmLabel: 'sil', destructive: true,
            action: () => run(async () =>
              reloadPullRequests(await api<PullRequestFeed>(`pull-requests/${pullRequest.id}${prView()}`, 'DELETE'))),
          })}/>
      </div>}

      {route.page === 'logs' && <div className="page-body">
        <LogsPage log={log} busy={busy} taskId={logTask}
          onProject={projectId => {
            setLogProject(projectId);
            setLogTask(null);
            void run(async () => setLog(await api<ActivityLog>(`logs?projectId=${projectId}`)));
          }}
          onTask={taskId => {
            setLogTask(taskId);
            const query = `logs?projectId=${logProject ?? ''}${taskId ? `&taskId=${taskId}` : ''}`;
            void run(async () => setLog(await api<ActivityLog>(query)));
          }}/>
      </div>}

      {route.page === 'notifications' && <div className="page-body">
        <NotificationsPage feed={feed} busy={busy}
          onOpen={openNotification}
          onRead={item => void run(async () => setFeed(await api<NotificationFeed>(`notifications/${item.id}/read`, 'PATCH')))}
          onReadAll={() => void run(async () => setFeed(await api<NotificationFeed>('notifications/read', 'PATCH')))}/>
      </div>}

      {route.page === 'announcements' && <div className="page-body">
        {route.announcementId !== null && announcementReport
          ? <AnnouncementReportPage detail={announcementReport} onBack={() => navigate(paths.announcements)}/>
          : <AnnouncementsPage announcements={announcements} busy={busy}
              onRead={item => void run(async () => {
                setAnnouncements(await api<Announcement[]>(`announcements/${item.id}/read`, 'PATCH'));
                // Duyuru okundu işaretlendiğinde aynı duyurunun bildirimi de okunmuş olur.
                setFeed(await api<NotificationFeed>('notifications'));
                setMandatory(current => current.filter(pending => pending.id !== item.id));
              })}
              onOpenReport={item => navigate(paths.announcementDetail(item.id))}
              onEdit={item => void run(async () => {
                setError('');
                setAnnouncementGroups(await api<{id: number; name: string}[]>('announcements/groups'));
                setAnnouncementDraft(item);
              })}
              onDelete={item => ask({
                title: 'Duyuruyu sil', description: `“${item.title}” duyurusu ve okuma kayıtları kaldırılacak.`,
                confirmLabel: 'sil', destructive: true,
                action: () => run(async () => {
                  setAnnouncements(await api<Announcement[]>(`announcements/${item.id}`, 'DELETE'));
                  setFeed(await api<NotificationFeed>('notifications'));
                  setMandatory(current => current.filter(pending => pending.id !== item.id));
                }),
              })}/>}
      </div>}

      {route.page === 'reports' && (route.personId !== null && reportDetail
        ? <ReportDetailPage detail={reportDetail} onBack={() => navigate(paths.reports)}/>
        : <ReportsPage report={report} busy={busy} onOpenPerson={id => navigate(paths.reportDetail(id))}/>)}
    </main>

    <PullRequestDialog draft={pullRequestDraft} projects={pullRequests.projects} defaultProjectId={prProject}
      busy={busy} error={error}
      onLoadTasks={projectId => api<LinkableTask[]>(`pull-requests/tasks?projectId=${projectId}`)}
      onClose={() => setPullRequestDraft(null)}
      onSubmit={({projectId, ...values}, editing) => void run(async () => {
        setPullRequests(editing
          ? await api<PullRequestFeed>(`pull-requests/${editing.id}${prView()}`, 'PATCH', values)
          : await api<PullRequestFeed>(`pull-requests${prView()}`, 'POST', {...values, projectId}));
        setPullRequestDraft(null);
      })}/>

    <PrWarningDialog task={prWarning ? board.tasks.find(item => item.id === prWarning.taskId) ?? null : null}
      columnName={board.columns.find(column => column.id === prWarning?.columnId)?.name ?? ''}
      busy={busy} error={error} canMerge={can.mergePr}
      onMerge={pullRequestId => void run(async () => {
        await api<PullRequestFeed>(`pull-requests/${pullRequestId}/state`, 'PATCH', {state: 'merged'});
        // Pano tazelenince uyarı listesi küçülür; son PR onaylanınca modal kendiliğinden kapanır.
        if (board.project) setBoard(await api<Board>(`projects/${board.project.id}/board`));
      })}
      onConfirm={() => prWarning && moveTask(prWarning.taskId, prWarning.columnId)}
      onCancel={() => setPrWarning(null)}/>

    <NewTaskDialog open={taskDraft !== null} board={board} members={members} columnId={taskDraft ?? 0} busy={busy} error={error}
      onClose={() => setTaskDraft(null)}
      onSubmit={(values, files) => void run(async () => {
        const created = await api<Board & {createdTaskId: number}>('tasks', 'POST', values);
        setBoard(created);
        setTaskDraft(null);
        if (files.length) setBoard(await api<Board>(`tasks/${created.createdTaskId}/attachments`, 'POST', fileBody(files)));
      })}/>

    <TaskDetailDialog task={openTask} board={board} members={members} currentUser={user} busy={busy} error={error}
      canUpdate={can.updateTask} canDelete={can.deleteTask}
      onClose={() => {
        setOpenTask(null);
        if (route.page === 'board' && route.taskId !== null) navigate(paths.board(route.projectId), {replace: true});
      }}
      onSave={values => void run(async () => {
        const next = await api<Board>(`tasks/${openTask!.id}`, 'PATCH', values);
        setBoard(next);
        setOpenTask(next.tasks.find(item => item.id === openTask!.id) ?? null);
      })}
      onMove={columnId => requestMove(openTask!.id, columnId)}
      onDelete={() => void run(async () => {
        setBoard(await api<Board>(`tasks/${openTask!.id}`, 'DELETE'));
        setOpenTask(null);
      })}
      onAddAttachments={files => void run(async () => {
        const next = await api<Board>(`tasks/${openTask!.id}/attachments`, 'POST', fileBody(files));
        setBoard(next);
        setOpenTask(next.tasks.find(item => item.id === openTask!.id) ?? null);
      })}
      onReplaceAttachment={(attachmentId, file) => void run(async () => {
        const next = await api<Board>(`tasks/${openTask!.id}/attachments/${attachmentId}`, 'PATCH', fileBody([file], 'file'));
        setBoard(next);
        setOpenTask(next.tasks.find(item => item.id === openTask!.id) ?? null);
      })}
      onDeleteAttachment={attachmentId => ask({
        title: 'Dosyayı sil',
        description: `${attachmentName(attachmentId)} task'tan silinecek.`,
        confirmLabel: 'sil', destructive: true,
        action: () => reloadTask(`tasks/${openTask!.id}/attachments/${attachmentId}`),
      })}
      onAddComment={(body, mentions, files) => run(async () => {
        const form = fileBody(files);
        form.append('body', body);
        form.append('mentions', JSON.stringify(mentions));
        const next = await api<Board>(`tasks/${openTask!.id}/comments`, 'POST', form);
        setBoard(next);
        setOpenTask(next.tasks.find(item => item.id === openTask!.id) ?? null);
      })}
      onUpdateComment={(commentId, body, mentions, files) => run(async () => {
        // Metin, etiketler ve yeni dosyalar tek istekte gider; dosya yoksa gövde boş FormData kalır.
        const form = fileBody(files);
        form.append('body', body);
        form.append('mentions', JSON.stringify(mentions));
        const next = await api<Board>(`tasks/${openTask!.id}/comments/${commentId}`, 'PATCH', form);
        setBoard(next);
        setOpenTask(next.tasks.find(item => item.id === openTask!.id) ?? null);
      })}
      onRemoveCommentAttachment={(commentId, attachmentId) => ask({
        title: 'Dosyayı kaldır',
        description: `${commentAttachmentName(commentId, attachmentId)} yorumdan kaldırılacak.`,
        confirmLabel: 'kaldır', destructive: true,
        action: () => reloadTask(`tasks/${openTask!.id}/comments/${commentId}/attachments/${attachmentId}`),
      })}
      onDeleteComment={commentId => ask({
        title: 'Yorumu sil',
        description: 'Yorum ve ekleri silinecek.',
        confirmLabel: 'sil', destructive: true,
        action: () => reloadTask(`tasks/${openTask!.id}/comments/${commentId}`),
      })}/>

    <WorkflowDialog open={workflowOpen} board={board} busy={busy} error={error}
      canSave={board.transitions.length ? can.updateWorkflow : can.createWorkflow}
      canClear={can.deleteWorkflow}
      onClose={() => setWorkflowOpen(false)}
      onSave={transitions => void run(async () => {
        const saved = await api<Workflow>(`projects/${board.project!.id}/workflow`, 'PUT', {transitions} as {transitions: Transition[]});
        setBoard(current => ({...current, transitions: saved.transitions}));
        setWorkflowOpen(false);
      })}
      onClear={() => void run(async () => {
        const saved = await api<Workflow>(`projects/${board.project!.id}/workflow`, 'DELETE');
        setBoard(current => ({...current, transitions: saved.transitions}));
        setWorkflowOpen(false);
      })}/>

    <ColumnsDialog open={columnsOpen} board={board} busy={busy} error={error}
      onClose={() => setColumnsOpen(false)}
      onPreview={columnIds => setBoard(current => ({
        ...current,
        columns: columnIds.map(id => current.columns.find(column => column.id === id)!).filter(Boolean),
      }))}
      onReorder={columnIds => {
        const snapshot = board.columns;
        return run(async () => {
          try { setBoard(await api<Board>('columns/order', 'PATCH', {columnIds})); }
          catch (err) { setBoard(current => ({...current, columns: snapshot})); throw err; }
        });
      }}
      onRename={(columnId, name) => void run(async () => setBoard(await api<Board>(`columns/${columnId}`, 'PATCH', {name})))}
      onRemove={columnId => void run(async () => setBoard(await api<Board>(`columns/${columnId}`, 'DELETE')))}
      onCreate={(name, done) => void run(async () => {
        setBoard(await api<Board>('columns', 'POST', {name, projectId: board.project?.id}));
        done();
      })}/>

    <UserDialog draft={userDraft} busy={busy} error={error}
      onClose={() => setUserDraft(null)}
      onSubmit={(values, editing) => void run(async () => {
        setUsers(await api<User[]>(editing ? `users/${editing.id}` : 'users', editing ? 'PATCH' : 'POST', values));
        setUserDraft(null);
      })}/>

    <GroupDialog draft={groupDraft} candidates={candidates} busy={busy} error={error}
      onClose={() => setGroupDraft(null)}
      onSubmit={(values, editing) => void run(async () => {
        setGroups(await api<Group[]>(editing ? `groups/${editing.id}` : 'groups', editing ? 'PATCH' : 'POST', values));
        setGroupDraft(null);
      })}/>

    <ProjectDialog draft={projectDraft} busy={busy} error={error}
      onClose={() => setProjectDraft(null)}
      onSubmit={(values, editing) => void run(async () => {
        setProjects(await api<Project[]>(editing ? `projects/${editing.id}` : 'projects', editing ? 'PATCH' : 'POST', values));
        setSummary(await api<SummaryProject[]>('dashboard'));
        setProjectDraft(null);
      })}/>

    <ProjectMembersDialog project={memberProject} members={members} everyone={everyone} busy={busy} error={error}
      onClose={() => setMemberProject(null)}
      onAdd={person => void run(async () => {
        setMembers(await api<User[]>(`projects/${memberProject!.id}/members`, 'POST', {userId: person.id}));
        setProjects(await api<Project[]>('projects'));
      })}
      onRemove={person => void run(async () => {
        setMembers(await api<User[]>(`projects/${memberProject!.id}/members/${person.id}`, 'DELETE'));
        setProjects(await api<Project[]>('projects'));
      })}/>

<ConfirmDialog request={confirmation} busy={busy} error={error}
      onClose={() => setConfirmation(null)}
      onDone={() => setConfirmation(null)}/>

    <AnnouncementDialog draft={announcementDraft} groups={announcementGroups} canTargetEveryone={isAdmin === true}
      busy={busy} error={error}
      onClose={() => setAnnouncementDraft(null)}
      onSubmit={(values, editing) => void run(async () => {
        const form = fileBody(values.image ? [values.image] : [], 'image');
        form.append('title', values.title);
        form.append('body', values.body);
        form.append('groupIds', JSON.stringify(values.groupIds));
        if (editing) form.append('removeImage', String(values.removeImage));
        else form.append('mandatory', String(values.mandatory));
        setAnnouncements(await api<Announcement[]>(editing ? `announcements/${editing.id}` : 'announcements', editing ? 'PATCH' : 'POST', form));
        setFeed(await api<NotificationFeed>('notifications'));
        setAnnouncementDraft(null);
      })}/>

    {/* Zorunlu duyurular okunana kadar girişte sırayla açılır. */}
    <AnnouncementPopup items={mandatory} busy={busy}
      onRead={item => void run(async () => {
        await api(`announcements/${item.id}/read`, 'PATCH');
        setMandatory(current => current.filter(pending => pending.id !== item.id));
        setFeed(await api<NotificationFeed>('notifications'));
        if (route.page === 'announcements') setAnnouncements(await api<Announcement[]>('announcements'));
      })}/>

    <PermissionsDialog person={permissionPerson} definitions={definitions} busy={busy} error={error}
      onClose={() => setPermissionPerson(null)}
      onSubmit={(permissions, person) => void run(async () => {
        setPeople(await api<User[]>(`permissions/${person.id}`, 'PATCH', {permissions}));
        setPermissionPerson(null);
      })}/>
  </div>;
}
