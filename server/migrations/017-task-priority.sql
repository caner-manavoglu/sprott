-- Task önceliği. Mevcut task'lar 'normal' ile başlar; 'highest' panoda altın
-- sarısı çerçeveyle işaretlenir.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal'
  CHECK (priority IN ('lowest', 'low', 'normal', 'high', 'highest'));
