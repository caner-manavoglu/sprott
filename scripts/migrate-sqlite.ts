import { DatabaseSync } from 'node:sqlite';
import { PrismaService } from '../server/prisma/prisma.service.ts';
import { sql } from '../server/prisma/sql.ts';

// One-time migration: source stays untouched; a populated destination is refused.
const source = new DatabaseSync(process.argv[2] || 'data/sprott.sqlite', {readOnly: true});
const prisma = new PrismaService();
try {
  await prisma.$transaction(async client => {
    await sql(client, 'LOCK TABLE users, sessions, columns, tasks IN ACCESS EXCLUSIVE MODE');
    for (const table of ['users', 'sessions', 'columns', 'tasks']) {
      if ((await sql(client, `SELECT 1 FROM ${table} LIMIT 1`)).rowCount) throw new Error('Hedef PostgreSQL boş olmalı; hiçbir kayıt değiştirilmedi.');
    }
    for (const table of ['users', 'columns', 'tasks', 'sessions']) {
      const rows = source.prepare(`SELECT * FROM ${table}`).all();
      for (const row of rows) {
        const keys = Object.keys(row);
        await sql(client, `INSERT INTO ${table} (${keys.map(key => `"${key}"`).join(',')}) VALUES (${keys.map((_, index) => `$${index + 1}`).join(',')})`, Object.values(row));
      }
      if (table !== 'sessions') await sql(client, `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE(MAX(id), 1), COUNT(*) > 0) FROM ${table}`);
      console.log(`${table}: ${rows.length} kayıt hazırlandı.`);
    }
  });
  console.log('PostgreSQL aktarımı tamamlandı. SQLite dosyası korundu.');
} finally { source.close(); await prisma.$disconnect(); }
