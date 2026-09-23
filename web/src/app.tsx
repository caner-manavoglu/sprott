import { useEffect, useState } from 'react';
import { ChevronRight, Columns3, GitBranch, PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react';
import { api, fileBody } from './api';
import { Brand } from './components/brand';
import { Login } from './components/login';
import { Sidebar } from './components/sidebar';
import { subscribeLive } from './lib/live';
import { NotificationBell } from './components/notifications';
import { TaskSearch } from './components/task-search';
import { PageActionsSlot } from './components/page-actions';
import { ThemeToggle } from './components/theme-toggle';
import { AnnouncementPopup } from './components/announcement';
import { Button } from './components/ui';
import { ColumnsDialog } from './components/dialogs/columns-dialog';
import { NewTaskDialog, TaskDetailDialog } from './components/dialogs/task-dialog';
import { PullRequestsPage } from './pages/pull-requests-page';
import { PullRequestDialog, type PullRequestDraft } from './components/dialogs/pull-request-dialog';
import { PrWarningDialog } from './components/dialogs/pr-warning-dialog';
import { WorkflowDialog } from './components/dialogs/workflow-dialog';
import { ConfirmDialog, type Confirmation } from './components/dialogs/confirm-dialog';
import { BoardPage } from './pages/board-page';
import { DashboardPage } from './pages/dashboard-page';
import { MyTasksPage } from './pages/my-tasks-page';
import { GroupsView } from './pages/groups-page';
import { PermissionsPage } from './pages/permissions-page';
import { ProjectsView } from './pages/projects-page';
import { LogsPage } from './pages/logs-page';
import { ReportsView } from './pages/reports-page';
import { UsersView } from './pages/users-page';
import { NotificationsPage } from './pages/notifications-page';
import { ProfilePage } from './pages/profile-page';
import { ForumsPage } from './pages/forums-page';
import { AnnouncementReportPage, AnnouncementsPage } from './pages/announcements-page';
import { AnnouncementDialog, type AnnouncementDraft } from './components/dialogs/announcement-dialog';
import { allowed, roleLabel } from './lib/format';
import { useAsync } from './lib/use-async';
import { emptyBoard, emptyPullRequests, emptyFeed } from './lib/types';
import type { Announcement, MyTask, AnnouncementDetail, Board, Notification, NotificationFeed, LinkableTask, OverdueTask, Project, PullRequestFeed, SummaryProject, Task, TaskComment, Transition, User, Workflow } from './lib/types';
import { headingFor, matchRoute, navigate, pageTitles, paths, usePath } from './routes';

export function App() {
  const path = usePath();
  const route = matchRoute(path);
  const {busy, error, setError, run} = useAsync();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Sayfa verileri: her sayfa kendi listesini açıldığında yükler.
  const [board, setBoard] = useState<Board>(emptyBoard);
  const [members, setMembers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [summary, setSummary] = useState<SummaryProject[]>([]);
  const [overdue, setOverdue] = useState<OverdueTask[]>([]);
  const [feed, setFeed] = useState<NotificationFeed>(emptyFeed);
  const [bellOpen, setBellOpen] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [announcementReport, setAnnouncementReport] = useState<AnnouncementDetail | null>(null);
  // Duyuru yapılabilecek gruplar ve okunmamış zorunlu duyurular oturum boyunca taşınır.
  const [announcementGroups, setAnnouncementGroups] = useState<{id: number; name: string}[]>([]);
  const [announcementDraft, setAnnouncementDraft] = useState<AnnouncementDraft | null>(null);
  const [mandatory, setMandatory] = useState<Announcement[]>([]);

  // Açık modallar.
  const [myTasks, setMyTasks] = useState<MyTask[]>([]);
  const [pullRequests, setPullRequests] = useState<PullRequestFeed>(emptyPullRequests);
  /** PR ekranının proje süzgeci; null "tüm projeler" demektir ve varsayılandır. */
  const [prProject, setPrProject] = useState<number | null>(null);
  const [pullRequestDraft, setPullRequestDraft] = useState<PullRequestDraft | null>(null);
  /** Tamamlandı sütununa taşınırken açık PR uyarısı; onaylanırsa taşıma yapılır. */
  const [prWarning, setPrWarning] = useState<{taskId: number; columnId: number} | null>(null);
  const [taskDraft, setTaskDraft] = useState<number | null>(null);
  const [openTask, setOpenTask] = useState<Task | null>(null);
  /** Açık task'ın yorumları; pano yanıtında taşınmaz, task açılınca ayrıca çekilir. */
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  /** Sayfaların kendi "ekle" düğmelerini koyduğu başlık alanı. */
  const [actionsSlot, setActionsSlot] = useState<HTMLDivElement | null>(null);
  // Geri alınması zor her işlem aynı onay modalından geçer.
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const ask = (request: Confirmation) => {setError(''); setConfirmation(request);};
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

  // Kök adres ve tanınmayan yollar özete düşer; adres çubuğu da özetin yolunu gösterir.
  useEffect(() => {
    if (route.page === 'dashboard' && path !== paths.dashboard) navigate(paths.dashboard, {replace: true});
  }, [path]);

  /** Oturum verisi: proje listesi, özet, bildirimler ve bekleyen zorunlu duyurular. */
  async function loadSession() {
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
  async function refresh() {
    setUser(await api<User>('me'));
    await loadSession();
  }

  useEffect(() => {
    const expired = () => {
      setUser(null);
      setBoard(emptyBoard);
      navigate(paths.dashboard);
    };
    window.addEventListener('session-expired', expired);
    // Oturum çerezi JavaScript'ten okunamaz; geçerli olup olmadığını /me söyler.
    refresh()
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
    // Başka projenin panosu değiştiyse bu pano yeniden çekilmez; bildirimler her olayda tazelenir.
    let boardChanged = false;
    const sync = async (projectId: number | null) => {
      if (route.page === 'board' && (projectId === null || projectId === route.projectId)) boardChanged = true;
      if (pending) {rerun = true; return;}
      pending = true;
      try {
        do {
          rerun = false;
          if (allowed(user, 'forum.view')) {
            const delivered = await api<{id: number}[]>('forums/deliveries');
            if (!cancelled && delivered.length) await api('forums/receipts', 'POST', {ids: delivered.map(message => message.id), kind: 'delivered'});
          }
          if (route.page === 'board' && boardChanged) {
            boardChanged = false;
            const next = await api<Board>(`projects/${route.projectId}/board`);
            if (!cancelled) setBoard(next);
            if (route.taskId !== null) {
              const list = await api<TaskComment[]>(`tasks/${route.taskId}/comments`).catch(() => null);
              if (!cancelled && list) setComments(list);
            }
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
    const unsubscribe = subscribeLive(projectId => {void sync(projectId);});
    return () => {cancelled = true; unsubscribe();};
  }, [user?.id, path, allowed(user, 'forum.view')]);

  /** Pano verisi projeye bağlıdır; adresteki task kimliği değişince yeniden çekilmez. */
  const dataKey = route.page === 'board' ? `board:${route.projectId}` : path;

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
        case 'myTasks':
          setMyTasks(await api<MyTask[]>('tasks/mine'));
          break;
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
      }
    });
  }, [user?.id, dataKey]);

  // Adres task'sız kaldığında (geri tuşu, dialog kapatma) detay da kapanır.
  useEffect(() => {
    if (route.page === 'board' && route.taskId === null) setOpenTask(null);
  }, [path]);

  // Task açılınca yorumları yüklenir; kapanınca eski task'ın yorumları görünmesin diye boşaltılır.
  useEffect(() => {
    setComments([]);
    if (!openTask) return;
    api<TaskComment[]>(`tasks/${openTask.id}/comments`).then(setComments).catch(err => setError((err as Error).message));
  }, [openTask?.id]);

  if (loading) return <div className="loading"><Brand/><p>Çalışma alanı yükleniyor…</p></div>;

  if (!user) return <Login busy={busy} error={error} themeToggle={<ThemeToggle/>}
    onSubmit={credentials => void run(async () => {
      // Sunucu oturum çerezini yazar; yanıttaki token tarayıcıda saklanmaz.
      const {token: _token, ...me} = await api<User & {token: string}>('login', 'POST', credentials);
      setUser(me);
      navigate(paths.dashboard);
      await loadSession();
    })}/>;

  const heading = headingFor(route, board);

  /** Sayfa başlığındaki sağ taraftaki eylemler sayfaya göre değişir. */
  const headerActions = <>
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

  /** Detay kapanırken adres de panoya döner; açık task adres çubuğunda yaşar. */
  const closeTask = () => {
    setOpenTask(null);
    // Pano filtreleri sorgu dizesinde yaşadığı için detay açılıp kapanırken korunur.
    if (route.page === 'board' && route.taskId !== null) navigate(paths.board(route.projectId) + location.search, {replace: true});
  };

  const moveTask = (taskId: number, columnId: number) => void run(async () => {
    setBoard(await api<Board>(`tasks/${taskId}`, 'PATCH', {columnId}));
    closeTask();
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

  /** Dosya silme panoyu ve açık task'ı aynı yanıttan tazeler. */
  const reloadTask = (path: string, method = 'DELETE') => run(async () => {
    const next = await api<Board>(path, method);
    setBoard(next);
    setOpenTask(next.tasks.find(item => item.id === openTask!.id) ?? null);
  });
  /** Yorum işlemleri yalnızca açık task'ın yorum listesini döndürür. */
  const reloadComments = (path: string, method = 'DELETE', body?: unknown) =>
    run(async () => setComments(await api<TaskComment[]>(path, method, body)));

  /** Proje listesi değişince kenar çubuğu, özet ve açık kalmış pano verisi tazelenir. */
  const projectsChanged = async (list: Project[]) => {
    setProjects(list);
    setSummary(await api<SummaryProject[]>('dashboard'));
    const current = board.project?.id;
    if (current === undefined) return;
    // Silinen projenin panosu bırakılır; tamamlanan/yeniden açılan projenin kilidi güncellenir.
    setBoard(list.some(project => project.id === current) ? await api<Board>(`projects/${current}/board`) : emptyBoard);
  };

  // Onay metninde dosya adı geçsin diye açık task üzerinden aranır.
  const attachmentName = (attachmentId: number) =>
    openTask?.attachments?.find(item => item.id === attachmentId)?.name ?? 'Dosya';
  const commentAttachmentName = (commentId: number, attachmentId: number) =>
    comments.find(item => item.id === commentId)?.attachments
      .find(item => item.id === attachmentId)?.name ?? 'Dosya';

  return <div className={`app-shell${sidebarOpen ? '' : ' sidebar-closed'}`}>
    <Sidebar open={sidebarOpen} user={user} page={route.page} board={board} projects={projects} busy={busy} projectsOpen={projectsOpen} unread={feed.unread}
      can={{projects: can.viewProjects, users: can.viewUsers, groups: can.viewGroups, logs: can.viewLogs, prs: can.viewPrs, admin: !!isAdmin}}
      onToggleProjects={() => setProjectsOpen(open => !open)}
      onLogout={() => void run(async () => {
        await api('logout', 'POST');
        setUser(null);
        setBoard(emptyBoard);
        setFeed(emptyFeed);
        navigate(paths.dashboard);
      })}/>

    {/* `key` sayfa değişince içeriği yeniden bağlar; böylece giriş animasyonu her geçişte çalışır. */}
    <PageActionsSlot.Provider value={actionsSlot}>
    <main className="main-content" key={route.page}>
      <header className="topbar">
        <div>
          <button type="button" className="sidebar-toggle" aria-label={`Kenar çubuğunu ${sidebarOpen ? 'kapat' : 'aç'}`}
            aria-controls="sidebar" aria-expanded={sidebarOpen} title={`Kenar çubuğunu ${sidebarOpen ? 'kapat' : 'aç'}`}
            onClick={() => setSidebarOpen(open => !open)}>{sidebarOpen ? <PanelLeftClose size={17}/> : <PanelLeftOpen size={17}/>}</button>
          Çalışma alanı <ChevronRight size={14}/><span>{pageTitles[route.page].crumb}</span>
        </div>
        <div className="topbar-actions">
          {can.viewTasks && <TaskSearch onOpenTask={item => navigate(paths.boardTask(item.projectId, item.id))}/>}
          <NotificationBell feed={feed} open={bellOpen}
            onToggle={() => setBellOpen(open => !open)}
            onClose={() => setBellOpen(false)}
            onOpen={item => void run(async () => setFeed(await api<NotificationFeed>(`notifications/${item.id}/read`, 'PATCH')))}
            onReadAll={() => void run(async () => setFeed(await api<NotificationFeed>('notifications/read', 'PATCH')))}
            onSeeAll={() => {setBellOpen(false); navigate(paths.notifications);}}/>
          <span className="role-pill"><span/>{roleLabel(user.role)} hesabı</span>
          <ThemeToggle/>
        </div>
      </header>

      <section className="page-header">
        <div>
          <div className="eyebrow">{heading.eyebrow}</div>
          <h1>{heading.heading}</h1>
          <p className="muted">{heading.description}</p>
        </div>
        <div className="header-actions" ref={setActionsSlot}>{headerActions}</div>
      </section>

      {error && <div className="page-error error" role="alert">{error}</div>}

      {route.page === 'dashboard' && <div className="page-body">
        <DashboardPage summary={summary} overdue={overdue} isAdmin={!!isAdmin}
          openPrs={pullRequests.rows.filter(row => row.state === 'open')} announcements={announcements}
          onOpen={id => navigate(paths.board(id))}/>
      </div>}

      {route.page === 'myTasks' && <div className="page-body"><MyTasksPage tasks={myTasks}/></div>}
      {route.page === 'forums' && <div className="page-body"><ForumsPage user={user}/></div>}

      {route.page === 'profile' && <div className="page-body"><ProfilePage user={user} busy={busy} onSave={body => void run(async () => {
        setUser({...await api<User>('users/me', 'PATCH', body), avatarVersion: Date.now()});
      })}/></div>}

      {route.page === 'projects' && <ProjectsView projects={projects} onChange={projectsChanged}
        can={{create: can.createProject, update: can.updateProject, delete: can.deleteProject}}/>}

      {route.page === 'board' && <BoardPage board={board} members={members} busy={busy} locked={boardLocked}
        canCreate={can.createTask} canUpdate={can.updateTask} isAdmin={!!isAdmin}
        onAddTask={columnId => {setError(''); setTaskDraft(columnId);}}
        onOpenTask={task => {setError(''); setOpenTask(task); navigate(paths.boardTask(route.projectId, task.id) + location.search);}}
        onMove={requestMove}/>}

      {route.page === 'permissions' && <PermissionsPage/>}

      {route.page === 'users' && <UsersView currentUser={user}
        canCreate={can.createUser} canUpdate={can.updateUser} canDelete={can.deleteUser}/>}

      {route.page === 'groups' && <GroupsView canCreate={can.createGroup} canUpdate={can.updateGroup} canDelete={can.deleteGroup}/>}

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

      {route.page === 'logs' && <div className="page-body"><LogsPage/></div>}

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

      {route.page === 'reports' && <ReportsView personId={route.personId}/>}
    </main>
    </PageActionsSlot.Provider>

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

    <TaskDetailDialog task={openTask} comments={comments} board={board} members={members} currentUser={user} busy={busy} error={error}
      canUpdate={can.updateTask} canDelete={can.deleteTask}
      onClose={closeTask}
      onSave={values => void run(async () => {
        const next = await api<Board>(`tasks/${openTask!.id}`, 'PATCH', values);
        setBoard(next);
        setOpenTask(next.tasks.find(item => item.id === openTask!.id) ?? null);
      })}
      onMove={columnId => requestMove(openTask!.id, columnId)}
      onDelete={() => void run(async () => {
        setBoard(await api<Board>(`tasks/${openTask!.id}`, 'DELETE'));
        closeTask();
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
      onAddComment={(body, mentions, files) => {
        const form = fileBody(files);
        form.append('body', body);
        form.append('mentions', JSON.stringify(mentions));
        return reloadComments(`tasks/${openTask!.id}/comments`, 'POST', form);
      }}
      onUpdateComment={(commentId, body, mentions, files) => {
        // Metin, etiketler ve yeni dosyalar tek istekte gider; dosya yoksa gövde boş FormData kalır.
        const form = fileBody(files);
        form.append('body', body);
        form.append('mentions', JSON.stringify(mentions));
        return reloadComments(`tasks/${openTask!.id}/comments/${commentId}`, 'PATCH', form);
      }}
      onRemoveCommentAttachment={(commentId, attachmentId) => ask({
        title: 'Dosyayı kaldır',
        description: `${commentAttachmentName(commentId, attachmentId)} yorumdan kaldırılacak.`,
        confirmLabel: 'kaldır', destructive: true,
        action: () => reloadComments(`tasks/${openTask!.id}/comments/${commentId}/attachments/${attachmentId}`),
      })}
      onDeleteComment={commentId => ask({
        title: 'Yorumu sil',
        description: 'Yorum ve ekleri silinecek.',
        confirmLabel: 'sil', destructive: true,
        action: () => reloadComments(`tasks/${openTask!.id}/comments/${commentId}`),
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
      onReorder={columnIds => run(async () => {
        try { setBoard(await api<Board>('columns/order', 'PATCH', {columnIds})); }
        catch (err) {
          // Önizleme panoyu zaten değiştirdiği için yerel anlık görüntü güvenilmez; gerçek sıra sunucudan alınır.
          if (board.project) setBoard(await api<Board>(`projects/${board.project.id}/board`));
          throw err;
        }
      })}
      onRename={(columnId, name) => void run(async () => setBoard(await api<Board>(`columns/${columnId}`, 'PATCH', {name})))}
      onRemove={columnId => void run(async () => setBoard(await api<Board>(`columns/${columnId}`, 'DELETE')))}
      onCreate={(name, done) => void run(async () => {
        setBoard(await api<Board>('columns', 'POST', {name, projectId: board.project?.id}));
        done();
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

  </div>;
}
