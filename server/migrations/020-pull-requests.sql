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
