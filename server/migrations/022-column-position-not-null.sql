-- Sütun sırası "son sütun = tamamlandı" tanımının tek dayanağıdır: gecikme işareti,
-- raporlardaki tamamlanan sayacı ve PR uyarısı bu sıraya bakar. İstemci sırayı artan,
-- sunucu azalan yönde okur; `position` boş kalırsa iki taraf farklı sütunu son sayar.
-- Kolonu NOT NULL yaparak bu sapma veritabanı düzeyinde imkânsız hale gelir.
UPDATE columns SET position = id WHERE position IS NULL;
ALTER TABLE columns ALTER COLUMN position SET NOT NULL;
