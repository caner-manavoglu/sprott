CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  surname TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users(id),
  expires BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS columns (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  "columnId" INTEGER NOT NULL REFERENCES columns(id),
  "createdBy" INTEGER NOT NULL REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS tasks_column_idx ON tasks("columnId");
