import type { Prisma } from '../generated/prisma/client.ts';

// PostgreSQL-specific reports, JSON aggregates and row/table locks that Prisma's query API
// cannot express. SQL text must be application-owned; request values are always separate
// bound parameters, never interpolated into SQL.

/** Rows from a SELECT/WITH or `... RETURNING` statement. */
export async function query<T = Record<string, any>>(client: Prisma.TransactionClient, text: string, values: unknown[] = []): Promise<T[]> {
  const rows = await client.$queryRawUnsafe<Record<string, any>[]>(text, ...values);
  return rows.map(pgValue) as T[];
}

/** Affected row count of a statement that returns no rows (UPDATE, INSERT, LOCK, SET). */
export function execute(client: Prisma.TransactionClient, text: string, values: unknown[] = []) {
  return client.$executeRawUnsafe(text, ...values);
}

// Keep the existing API's PostgreSQL bigint strings and binary downloads intact.
function pgValue(value: any): any {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(pgValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, pgValue(item)]));
  return value;
}
