-- Projelere isteğe bağlı planlama tarihleri ve tamamlanma damgası.
-- Tarihlerde kural yoktur; yalnızca kaydedilir ve proje listesinde gösterilir.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS "startDate" DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS "endDate" DATE;
-- Dolu olduğunda proje tamamlanmış sayılır: panosu salt okunur olur, kayıtlar korunur.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMPTZ;
