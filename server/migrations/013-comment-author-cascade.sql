ALTER TABLE task_comments DROP CONSTRAINT IF EXISTS "task_comments_authorId_fkey";
ALTER TABLE task_comments ADD CONSTRAINT "task_comments_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES users(id) ON DELETE CASCADE;
