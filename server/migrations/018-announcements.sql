CREATE TABLE IF NOT EXISTS announcements (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  -- Zorunlu duyuru, hiç görmemiş kişiye girişte modal olarak açılır.
  mandatory BOOLEAN NOT NULL DEFAULT FALSE,
  "imageName" TEXT,
  "imageMimeType" TEXT,
  "imageSize" INTEGER,
  "imageContent" BYTEA,
  "createdBy" INTEGER REFERENCES users(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Hedef grup satırı yoksa duyuru herkese açıktır; satır varsa yalnızca o grupların üyeleri görür.
CREATE TABLE IF NOT EXISTS announcement_groups (
  "announcementId" INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  "groupId" INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  PRIMARY KEY ("announcementId", "groupId")
);
-- Okundu bilgisi kişi bazında tutulur; zorunlu duyurunun raporu bu tablodan çıkar.
CREATE TABLE IF NOT EXISTS announcement_reads (
  "announcementId" INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "readAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("announcementId", "userId")
);
CREATE INDEX IF NOT EXISTS announcements_created_idx ON announcements("createdAt" DESC);

-- Duyuru bildirimleri bir task'a bağlı değildir; taskId artık boş bırakılabilir.
ALTER TABLE notifications ALTER COLUMN "taskId" DROP NOT NULL;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS "announcementId" INTEGER REFERENCES announcements(id) ON DELETE CASCADE;
