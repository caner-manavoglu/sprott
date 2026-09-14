ALTER TABLE forums ADD COLUMN IF NOT EXISTS "imageContent" BYTEA;
ALTER TABLE forums ADD COLUMN IF NOT EXISTS "imageMimeType" TEXT;
ALTER TABLE forums ADD COLUMN IF NOT EXISTS "imageVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE forum_messages ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMPTZ;
ALTER TABLE forum_messages ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;
ALTER TABLE forum_messages ADD COLUMN IF NOT EXISTS "receiptsInitialized" BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE IF NOT EXISTS forum_message_receipts (
 "messageId" INTEGER NOT NULL REFERENCES forum_messages(id) ON DELETE CASCADE,
 "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 "deliveredAt" TIMESTAMPTZ, "readAt" TIMESTAMPTZ,
 PRIMARY KEY ("messageId", "userId")
);
CREATE INDEX IF NOT EXISTS forum_receipts_pending ON forum_message_receipts ("userId", "messageId") WHERE "deliveredAt" IS NULL;
CREATE TABLE IF NOT EXISTS forum_message_hidden (
 "messageId" INTEGER NOT NULL REFERENCES forum_messages(id) ON DELETE CASCADE,
 "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 PRIMARY KEY ("messageId", "userId")
);
-- Eski mesajlar bir kez mevcut üyelerle başlatılır; görülme zamanı uydurulmaz.
INSERT INTO forum_message_receipts ("messageId", "userId")
 SELECT m.id, fm."userId" FROM forum_messages m JOIN forum_members fm ON fm."forumId"=m."forumId"
 WHERE NOT m."receiptsInitialized" AND fm.status='joined' AND fm."userId"<>m."authorId"
 ON CONFLICT DO NOTHING;
UPDATE forum_messages SET "receiptsInitialized"=TRUE WHERE NOT "receiptsInitialized";
