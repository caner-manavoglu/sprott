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
