ALTER TABLE columns ADD COLUMN IF NOT EXISTS position INTEGER;
UPDATE columns SET position = id WHERE position IS NULL;
