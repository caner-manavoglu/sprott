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
