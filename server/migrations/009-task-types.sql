ALTER TABLE tasks ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'task'
  CHECK (type IN ('task', 'bug', 'story', 'epic', 'subtask', 'feature'));
