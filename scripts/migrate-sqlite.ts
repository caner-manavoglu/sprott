import { DatabaseSync } from 'node:sqlite';
import { Store } from '../server/store.ts';

// One-time migration: source stays untouched; a populated destination is refused.
const source = new DatabaseSync(process.argv[2] || 'data/sprott.sqlite', {readOnly: true});
const store = new Store();
try {
  await store.initialize(false);
  await store.transaction(async client => {
    await client.query('LOCK TABLE users, sessions, columns, tasks IN ACCESS EXCLUSIVE MODE');
    for (const table of ['users', 'sessions', 'columns', 'tasks']) {
      if ((await client.query(`SELECT 1 FROM ${table} LIMIT 1`)).rowCount) throw new Error('Hedef PostgreSQL boş olmalı; hiçbir kayıt değiştirilmedi.');
    }
    for (const table of ['users', 'columns', 'tasks', 'sessions']) {
      const rows = source.prepare(`SELECT * FROM ${table}`).all();
      for (const row of rows) {
        const keys = Object.keys(row);
        await client.query(`INSERT INTO ${table} (${keys.map(key => `"${key}"`).join(',')}) VALUES (${keys.map((_, index) => `$${index + 1}`).join(',')})`, Object.values(row));
      }
      if (table !== 'sessions') await client.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE(MAX(id), 1), COUNT(*) > 0) FROM ${table}`);
      console.log(`${table}: ${rows.length} kayıt hazırlandı.`);
    }
  });
  console.log('PostgreSQL aktarımı tamamlandı. SQLite dosyası korundu.');
} finally { source.close(); await store.onModuleDestroy(); }
