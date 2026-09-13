/** Sunucudan dönen kayıtların istemci tarafındaki karşılıkları. */

import type { TaskType } from '../../../shared/task-types';
import type { TaskPriority } from '../../../shared/task-priorities';
export type Role = 'admin' | 'user';

export type User = {
  id: number;
  name: string;
  surname: string;
  title: string;
  email: string;
  role: Role;
  permissions: Record<string, boolean>;
  /** Rapor yetkisi için: kullanıcının yönettiği grupların adları. */
  managedGroups?: string[];
};

/** Grup ve proje listelerinde kullanılan sade kişi kaydı. */
export type Member = {id: number; name: string; surname: string; title: string};

export type Group = {id: number; name: string; members: Member[]; managers: Member[]};

export type Project = {
  id: number;
  name: string;
  description: string;
  /** İsteğe bağlı planlama tarihleri; yalnızca proje listesinde gösterilir. */
  startDate: string | null;
  endDate: string | null;
  /** Dolu ise proje tamamlanmıştır ve panosu salt okunurdur. */
  completedAt: string | null;
  columnCount: number;
  taskCount: number;
  memberCount: number;
};

export type Column = {id: number; name: string};

export type Attachment = {id: number; name: string; mimeType: string; size: number};
export type TaskComment = {
  id: number;
  body: string;
  authorId: number;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  mentions: {id: number; name: string}[];
  attachments: Attachment[];
};

export type Task = {
  type: TaskType;
  priority: TaskPriority;
  parentTaskId: number | null;
  parentTitle: string | null;
  id: number;
  title: string;
  description: string;
  columnId: number;
  /** Task'ı açan kişi; oluşturulduktan sonra değişmez. */
  createdBy: number;
  createdByName: string | null;
  assigneeId: number | null;
  /** 'YYYY-MM-DD'; tarihi girilmemiş task'larda null. */
  startDate: string | null;
  dueDate: string | null;
  attachments: Attachment[];
  comments: TaskComment[];
};

/** Üst çubuktaki aramanın döndürdüğü sade task kaydı. */
export type TaskSearchResult = {
  id: number;
  title: string;
  type: TaskType;
  priority: TaskPriority;
  columnId: number;
  columnName: string;
  projectId: number;
  projectName: string;
};

/** Özet ekranındaki "süresi geçen görevler" satırı. */
export type OverdueTask = {
  id: number;
  title: string;
  dueDate: string;
  daysLate: number;
  projectId: number;
  projectName: string;
  columnName: string;
  assigneeId: number | null;
  assigneeName: string | null;
};

/** Akış kuralı: bir sütundan diğerine geçişe izin verir. */
export type Transition = {fromColumnId: number; toColumnId: number};

export type Board = {
  project: {id: number; name: string; description: string; completedAt: string | null} | null;
  columns: Column[];
  tasks: Task[];
  /** Boş liste: proje için akış tanımlı değil, tüm geçişler serbest. */
  transitions: Transition[];
};

export type Workflow = {enabled: boolean; transitions: Transition[]};

export type SummaryColumn = {id: number; name: string; taskCount: number; tasks: {id: number; title: string}[]};
export type SummaryProject = {id: number; name: string; columns: SummaryColumn[]};

/** Yetki ekranındaki tek bir anahtar: 'task.create' gibi. */
export type Definition = {key: string; label: string};

export type Report = {
  scope: 'all' | 'group' | 'self';
  groups: string[];
  total: number;
  rows: {id: number; name: string; surname: string; title: string; assigned: number; completed: number; bugs: number; overdue: number}[];
};

export type ReportDetail = {
  person: Member;
  total: number;
  rows: {projectId: number; projectName: string; assigned: number; completed: number; bugs: number; overdue: number}[];
  /** Kişinin süresi geçen task'ları; hangi task, hangi projede, kaç gün gecikmiş. */
  overdue: OverdueTask[];
};

export const emptyBoard: Board = {project: null, columns: [], tasks: [], transitions: []};

/** Bildirim türü; metni istemci üretir. */
export type NotificationType = 'assigned' | 'completed' | 'mention' | 'comment' | 'announcement';

/** Duyuru bildirimleri bir task'a bağlı olmadığı için task ve proje alanları boş gelir. */
export type Notification = {
  id: number;
  type: NotificationType;
  taskId: number | null;
  taskTitle: string | null;
  taskType: TaskType | null;
  projectId: number | null;
  projectName: string | null;
  announcementId: number | null;
  announcementTitle: string | null;
  announcementMandatory: boolean | null;
  actorName: string | null;
  readAt: string | null;
  createdAt: string;
};

/** Duyuru: başlık, açıklama, isteğe bağlı görsel ve hedef gruplar. */
export type Announcement = {
  id: number;
  title: string;
  body: string;
  /** Zorunlu duyuru, hiç görmemiş kişiye girişte modal olarak açılır. */
  mandatory: boolean;
  hasImage: boolean;
  /** Boş liste: duyuru herkese açık. */
  groups: {id: number; name: string}[];
  author: {id: number; name: string; title: string} | null;
  /** Kişinin kendi okuma zamanı; okumadıysa null. */
  readAt: string | null;
  createdAt: string;
  /** Doğruysa okuma raporu görülebilir ve duyuru silinebilir. */
  canManage: boolean;
};

export type AnnouncementReader = {id: number; name: string; title: string; readAt: string};

/** Duyuru detayı: okuyanlar ve henüz okumayanlar. */
export type AnnouncementDetail = {
  announcement: Announcement;
  readers: AnnouncementReader[];
  pending: {id: number; name: string; title: string}[];
};

/** Bildirim ucunun yanıtı: liste ve rozette görünen okunmamış sayısı. */
export type NotificationFeed = {items: Notification[]; unread: number};

export const emptyFeed: NotificationFeed = {items: [], unread: 0};

/** Etkinlik günlüğü kaydının türü. */
export type LogAction = 'task.create' | 'task.move' | 'task.assign' | 'task.delete' | 'comment.create';

export type LogRow = {
  id: number;
  action: LogAction;
  detail: string | null;
  /** Silinen task'larda null; adı `taskTitle` içinde korunur. */
  taskId: number | null;
  taskTitle: string;
  actorId: number | null;
  actorName: string;
  createdAt: string;
};

export type ActivityLog = {
  projects: {id: number; name: string}[];
  projectId: number | null;
  tasks: {id: number; title: string}[];
  rows: LogRow[];
};
