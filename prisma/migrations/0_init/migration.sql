-- Baseline: existing PostgreSQL constraints and data migrations are preserved.
-- 001-initial.sql
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  surname TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users(id),
  expires BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS columns (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  "columnId" INTEGER NOT NULL REFERENCES columns(id),
  "createdBy" INTEGER NOT NULL REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS tasks_column_idx ON tasks("columnId");

-- 002-column-order.sql
ALTER TABLE columns ADD COLUMN IF NOT EXISTS position INTEGER;
UPDATE columns SET position = id WHERE position IS NULL;

-- 003-permissions.sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'canCreateTask') THEN
    -- Eski tek yetki bayrağını modül yetkilerine taşı.
    UPDATE users SET permissions = jsonb_build_object(
      'task.view', true,
      'task.create', "canCreateTask" = 1,
      'task.update', "canCreateTask" = 1,
      'task.delete', false
    ) WHERE role = 'user';
    UPDATE users SET permissions = '{}'::jsonb WHERE role = 'admin';
    ALTER TABLE users DROP COLUMN "canCreateTask";
  END IF;
END $$;

-- 004-user-profile.sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS surname TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';

-- 005-groups.sql
CREATE TABLE IF NOT EXISTS groups (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
-- Bir kullanıcı birden çok grupta olabilir; grup veya kullanıcı silinince üyelik de silinir.
CREATE TABLE IF NOT EXISTS group_members (
  "groupId" INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY ("groupId", "userId")
);
CREATE INDEX IF NOT EXISTS group_members_user_idx ON group_members("userId");

-- 006-projects.sql
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  "createdBy" INTEGER REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS project_members (
  "projectId" INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY ("projectId", "userId")
);
ALTER TABLE columns ADD COLUMN IF NOT EXISTS "projectId" INTEGER REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS "assigneeId" INTEGER REFERENCES users(id) ON DELETE SET NULL;
-- Projeler modülünden önceki tek pano bir projeye taşınır; mevcut kullanıcılar o projenin üyesi olur.
DO $$
DECLARE fallback INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM columns WHERE "projectId" IS NULL) THEN
    INSERT INTO projects(name, description) VALUES ('Genel pano', 'Projeler modülünden önce oluşturulmuş sütunlar.') RETURNING id INTO fallback;
    UPDATE columns SET "projectId" = fallback WHERE "projectId" IS NULL;
    INSERT INTO project_members("projectId", "userId") SELECT fallback, id FROM users ON CONFLICT DO NOTHING;
  END IF;
END $$;
ALTER TABLE columns ALTER COLUMN "projectId" SET NOT NULL;
CREATE INDEX IF NOT EXISTS columns_project_idx ON columns("projectId");
CREATE INDEX IF NOT EXISTS tasks_assignee_idx ON tasks("assigneeId");
-- Personel panolara projeler üzerinden ulaştığı için görüntüleme yetkisi varsayılan açılır.
UPDATE users SET permissions = permissions || '{"project.view": true}'::jsonb WHERE role = 'user' AND NOT permissions ? 'project.view';

-- 007-group-managers.sql
-- Bir grupta birden fazla yönetici olabilir; yönetici, grubun üyelerinin task'larını panoda geri alabilir.
CREATE TABLE IF NOT EXISTS group_managers (
  "groupId" INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY ("groupId", "userId")
);
CREATE INDEX IF NOT EXISTS group_managers_user_idx ON group_managers("userId");

-- 008-task-dates.sql
-- Task'lara planlama tarihleri. Mevcut task'larda tarih yoktur (NULL), bu yüzden
-- gecikme hesabına girmezler.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS "startDate" DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS "dueDate" DATE;
-- Özet ekranındaki "süresi geçen görevler" listesi bu indeksi kullanır.
CREATE INDEX IF NOT EXISTS tasks_due_idx ON tasks("dueDate") WHERE "dueDate" IS NOT NULL;

-- 009-task-types.sql
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'task'
  CHECK (type IN ('task', 'bug', 'story', 'epic', 'subtask', 'feature'));

-- 010-subtasks.sql
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS "parentTaskId" INTEGER REFERENCES tasks(id);
CREATE INDEX IF NOT EXISTS tasks_parent_idx ON tasks("parentTaskId") WHERE "parentTaskId" IS NOT NULL;

-- 011-task-attachments.sql
CREATE TABLE IF NOT EXISTS task_attachments (
  id SERIAL PRIMARY KEY,
  "taskId" INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  size INTEGER NOT NULL,
  content BYTEA NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS task_attachments_task_idx ON task_attachments("taskId");

-- 012-task-comments.sql
CREATE TABLE IF NOT EXISTS task_comments (
  id SERIAL PRIMARY KEY,
  "taskId" INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  "authorId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS task_comments_task_idx ON task_comments("taskId", "createdAt");

CREATE TABLE IF NOT EXISTS task_comment_mentions (
  "commentId" INTEGER NOT NULL REFERENCES task_comments(id) ON DELETE CASCADE,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY ("commentId", "userId")
);

CREATE TABLE IF NOT EXISTS task_comment_attachments (
  id SERIAL PRIMARY KEY,
  "commentId" INTEGER NOT NULL REFERENCES task_comments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  size INTEGER NOT NULL CHECK (size > 0),
  content BYTEA NOT NULL
);

-- 013-comment-author-cascade.sql
ALTER TABLE task_comments DROP CONSTRAINT IF EXISTS "task_comments_authorId_fkey";
ALTER TABLE task_comments ADD CONSTRAINT "task_comments_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES users(id) ON DELETE CASCADE;

-- 013-project-dates.sql
-- Projelere isteğe bağlı planlama tarihleri ve tamamlanma damgası.
-- Tarihlerde kural yoktur; yalnızca kaydedilir ve proje listesinde gösterilir.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS "startDate" DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS "endDate" DATE;
-- Dolu olduğunda proje tamamlanmış sayılır: panosu salt okunur olur, kayıtlar korunur.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMPTZ;

-- 014-notifications.sql
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 'assigned' | 'completed' | 'mention' | 'comment'
  type TEXT NOT NULL,
  "taskId" INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  "actorId" INTEGER REFERENCES users(id) ON DELETE SET NULL,
  "readAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications("userId", "readAt", "createdAt" DESC);

-- 015-workflow.sql
-- Proje akışı: hangi sütundan hangi sütuna geçilebileceği. Bir projede hiç satır
-- yoksa akış tanımsızdır ve tüm geçişler serbesttir (eski projelerin davranışı).
CREATE TABLE IF NOT EXISTS workflow_transitions (
  "projectId" INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  "fromColumnId" INTEGER NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
  "toColumnId" INTEGER NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
  PRIMARY KEY ("projectId", "fromColumnId", "toColumnId")
);

-- 016-activity-log.sql
-- Salt okunur etkinlik günlüğü. Kayıtlar yalnızca eklenir; uygulama hiçbir yerde
-- bu tabloyu güncellemez veya silmez, API'de de sadece GET ucu vardır.
CREATE TABLE IF NOT EXISTS activity_log (
  id BIGSERIAL PRIMARY KEY,
  "projectId" INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- Task silindikten sonra da kayıt okunabilsin diye foreign key yok; ad anlık kopyalanır.
  "taskId" INTEGER,
  "taskTitle" TEXT NOT NULL,
  action TEXT NOT NULL,
  -- Sütun değişiminde 'Yapılacak → Devam ediyor' gibi ek bilgi.
  detail TEXT,
  "actorId" INTEGER REFERENCES users(id) ON DELETE SET NULL,
  -- Kullanıcı silinse bile geçmişte kimin yaptığı görünsün.
  "actorName" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS activity_log_project_idx ON activity_log("projectId", "createdAt");
CREATE INDEX IF NOT EXISTS activity_log_task_idx ON activity_log("taskId");

-- 017-task-priority.sql
-- Task önceliği. Mevcut task'lar 'normal' ile başlar; 'highest' panoda altın
-- sarısı çerçeveyle işaretlenir.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal'
  CHECK (priority IN ('lowest', 'low', 'normal', 'high', 'highest'));

-- 018-announcements.sql
CREATE TABLE IF NOT EXISTS announcements (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  -- Zorunlu duyuru, hiç görmemiş kişiye girişte modal olarak açılır.
  mandatory BOOLEAN NOT NULL DEFAULT FALSE,
  "imageName" TEXT,
  "imageMimeType" TEXT,
  "imageSize" INTEGER,
  "imageContent" BYTEA,
  "createdBy" INTEGER REFERENCES users(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Hedef grup satırı yoksa duyuru herkese açıktır; satır varsa yalnızca o grupların üyeleri görür.
CREATE TABLE IF NOT EXISTS announcement_groups (
  "announcementId" INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  "groupId" INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  PRIMARY KEY ("announcementId", "groupId")
);
-- Okundu bilgisi kişi bazında tutulur; zorunlu duyurunun raporu bu tablodan çıkar.
CREATE TABLE IF NOT EXISTS announcement_reads (
  "announcementId" INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "readAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("announcementId", "userId")
);
CREATE INDEX IF NOT EXISTS announcements_created_idx ON announcements("createdAt" DESC);

-- Duyuru bildirimleri bir task'a bağlı değildir; taskId artık boş bırakılabilir.
ALTER TABLE notifications ALTER COLUMN "taskId" DROP NOT NULL;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS "announcementId" INTEGER REFERENCES announcements(id) ON DELETE CASCADE;

-- 019-mcp-tokens.sql
CREATE TABLE IF NOT EXISTS mcp_tokens (
  token TEXT PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires BIGINT NOT NULL
);

-- 020-pull-requests.sql
-- Bekleyen PR modülü. Bir PR birden çok task'a bağlanabilir, bu yüzden task'ın
-- alt kaydı değil birinci sınıf kayıttır. PR tek bir projeye aittir; erişim
-- kontrolü böylece mevcut proje üyeliği kurallarından türer.
CREATE TABLE IF NOT EXISTS pull_requests (
  id BIGSERIAL PRIMARY KEY,
  "projectId" INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  -- 'open' bekliyor, 'merged' onaylandı, 'closed' merge edilmeden kapatıldı.
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'merged', 'closed')),
  "mergedAt" TIMESTAMPTZ,
  -- Kimin işaretlediği kayıtta kalsın; kullanıcı silinse de PR kaybolmaz.
  "mergedBy" INTEGER REFERENCES users(id) ON DELETE SET NULL,
  "createdBy" INTEGER REFERENCES users(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Aynı PR aynı projeye iki kez eklenemez.
  UNIQUE ("projectId", url)
);

CREATE TABLE IF NOT EXISTS pull_request_tasks (
  "pullRequestId" BIGINT NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  "taskId" INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY ("pullRequestId", "taskId")
);

CREATE INDEX IF NOT EXISTS pull_request_tasks_task_idx ON pull_request_tasks("taskId");
-- "Bekleyen PR'lar" listesi yalnızca açık kayıtları tarar.
CREATE INDEX IF NOT EXISTS pull_requests_open_idx ON pull_requests("projectId", "createdAt") WHERE state = 'open';

-- PR yetkileri herkeste açık başlar; kısmak isteyen ekip yetkiler ekranından kapatır.
UPDATE users SET permissions = permissions
  || '{"pr.view":true,"pr.create":true,"pr.update":true,"pr.delete":true,"pr.merge":true}'::jsonb
WHERE role = 'user' AND NOT (permissions ? 'pr.view');

-- 021-mcp-connections.sql
ALTER TABLE mcp_tokens ADD COLUMN IF NOT EXISTS id SERIAL UNIQUE;
ALTER TABLE mcp_tokens ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Eski bağlantı';
ALTER TABLE mcp_tokens ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE mcp_tokens ADD COLUMN IF NOT EXISTS "lastUsedAt" TIMESTAMPTZ;

-- 022-column-position-not-null.sql
-- Sütun sırası "son sütun = tamamlandı" tanımının tek dayanağıdır: gecikme işareti,
-- raporlardaki tamamlanan sayacı ve PR uyarısı bu sıraya bakar. İstemci sırayı artan,
-- sunucu azalan yönde okur; `position` boş kalırsa iki taraf farklı sütunu son sayar.
-- Kolonu NOT NULL yaparak bu sapma veritabanı düzeyinde imkânsız hale gelir.
UPDATE columns SET position = id WHERE position IS NULL;
ALTER TABLE columns ALTER COLUMN position SET NOT NULL;

-- 023-user-avatar.sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS "avatarMimeType" TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "avatarContent" BYTEA;

-- 024-forums.sql
CREATE TABLE IF NOT EXISTS forums (
 id SERIAL PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
 "createdBy" INTEGER REFERENCES users(id) ON DELETE SET NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS forum_members (
 "forumId" INTEGER NOT NULL REFERENCES forums(id) ON DELETE CASCADE,
 "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 status TEXT NOT NULL CHECK (status IN ('pending','joined')), PRIMARY KEY ("forumId","userId")
);
CREATE TABLE IF NOT EXISTS forum_messages (
 id SERIAL PRIMARY KEY, "forumId" INTEGER NOT NULL REFERENCES forums(id) ON DELETE CASCADE,
 "authorId" INTEGER REFERENCES users(id) ON DELETE SET NULL, body TEXT NOT NULL DEFAULT '',
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS forum_messages_page ON forum_messages ("forumId", id DESC);
CREATE TABLE IF NOT EXISTS forum_files (
 id SERIAL PRIMARY KEY, "messageId" INTEGER NOT NULL REFERENCES forum_messages(id) ON DELETE CASCADE,
 name TEXT NOT NULL, "mimeType" TEXT NOT NULL, size INTEGER NOT NULL, content BYTEA NOT NULL
);
CREATE INDEX IF NOT EXISTS forum_files_message ON forum_files ("messageId");

-- 025-forum-chat.sql
ALTER TABLE forums ADD COLUMN IF NOT EXISTS "imageContent" BYTEA;
ALTER TABLE forums ADD COLUMN IF NOT EXISTS "imageMimeType" TEXT;
ALTER TABLE forums ADD COLUMN IF NOT EXISTS "imageVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE forum_messages ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMPTZ;
ALTER TABLE forum_messages ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;
ALTER TABLE forum_messages ADD COLUMN IF NOT EXISTS "receiptsInitialized" BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE IF NOT EXISTS forum_message_receipts (
 "messageId" INTEGER NOT NULL REFERENCES forum_messages(id) ON DELETE CASCADE,
 "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 "deliveredAt" TIMESTAMPTZ, "readAt" TIMESTAMPTZ,
 PRIMARY KEY ("messageId", "userId")
);
CREATE INDEX IF NOT EXISTS forum_receipts_pending ON forum_message_receipts ("userId", "messageId") WHERE "deliveredAt" IS NULL;
CREATE TABLE IF NOT EXISTS forum_message_hidden (
 "messageId" INTEGER NOT NULL REFERENCES forum_messages(id) ON DELETE CASCADE,
 "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 PRIMARY KEY ("messageId", "userId")
);
-- Eski mesajlar bir kez mevcut üyelerle başlatılır; görülme zamanı uydurulmaz.
INSERT INTO forum_message_receipts ("messageId", "userId")
 SELECT m.id, fm."userId" FROM forum_messages m JOIN forum_members fm ON fm."forumId"=m."forumId"
 WHERE NOT m."receiptsInitialized" AND fm.status='joined' AND fm."userId"<>m."authorId"
 ON CONFLICT DO NOTHING;
UPDATE forum_messages SET "receiptsInitialized"=TRUE WHERE NOT "receiptsInitialized";
