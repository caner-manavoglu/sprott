CREATE TABLE IF NOT EXISTS groups (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
-- Bir kullanıcı birden çok grupta olabilir; grup veya kullanıcı silinince üyelik de silinir.
CREATE TABLE IF NOT EXISTS group_members (
  "groupId" INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY ("groupId", "userId")
);
CREATE INDEX IF NOT EXISTS group_members_user_idx ON group_members("userId");
