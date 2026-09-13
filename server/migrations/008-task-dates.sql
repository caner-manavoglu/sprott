-- Task'lara planlama tarihleri. Mevcut task'larda tarih yoktur (NULL), bu yüzden
-- gecikme hesabına girmezler.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS "startDate" DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS "dueDate" DATE;
-- Özet ekranındaki "süresi geçen görevler" listesi bu indeksi kullanır.
CREATE INDEX IF NOT EXISTS tasks_due_idx ON tasks("dueDate") WHERE "dueDate" IS NOT NULL;
