-- Proje akışı: hangi sütundan hangi sütuna geçilebileceği. Bir projede hiç satır
-- yoksa akış tanımsızdır ve tüm geçişler serbesttir (eski projelerin davranışı).
CREATE TABLE IF NOT EXISTS workflow_transitions (
  "projectId" INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  "fromColumnId" INTEGER NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
  "toColumnId" INTEGER NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
  PRIMARY KEY ("projectId", "fromColumnId", "toColumnId")
);
