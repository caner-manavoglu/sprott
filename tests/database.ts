import { readFileSync } from 'node:fs';
import type { Pool } from 'pg';

/** Install the checked-in baseline only in a disposable test schema. */
export async function installTestSchema(pool: Pool, schema: string) {
  if (!/^sprott_(test|mcp|prisma)_[a-f0-9]+$/.test(schema)) throw new Error('Unexpected test schema');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL search_path = "${schema}"`);
    await client.query(readFileSync(new URL('../prisma/migrations/0_init/migration.sql', import.meta.url), 'utf8'));
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
