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
