ALTER TABLE tasks ADD COLUMN IF NOT EXISTS "parentTaskId" INTEGER REFERENCES tasks(id);
CREATE INDEX IF NOT EXISTS tasks_parent_idx ON tasks("parentTaskId") WHERE "parentTaskId" IS NOT NULL;
