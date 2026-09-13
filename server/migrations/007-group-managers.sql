-- Bir grupta birden fazla yönetici olabilir; yönetici, grubun üyelerinin task'larını panoda geri alabilir.
CREATE TABLE IF NOT EXISTS group_managers (
  "groupId" INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY ("groupId", "userId")
);
CREATE INDEX IF NOT EXISTS group_managers_user_idx ON group_managers("userId");
