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
