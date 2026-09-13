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
