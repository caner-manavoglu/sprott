ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'canCreateTask') THEN
    -- Eski tek yetki bayrağını modül yetkilerine taşı.
    UPDATE users SET permissions = jsonb_build_object(
      'task.view', true,
      'task.create', "canCreateTask" = 1,
      'task.update', "canCreateTask" = 1,
      'task.delete', false
    ) WHERE role = 'user';
    UPDATE users SET permissions = '{}'::jsonb WHERE role = 'admin';
    ALTER TABLE users DROP COLUMN "canCreateTask";
  END IF;
END $$;
