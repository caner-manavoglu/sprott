import type { Prisma } from '../generated/prisma/client.ts';

// PostgreSQL-specific reports and row/table locks. SQL text must be application-owned;
// request values are always separate bound parameters, never interpolated into SQL.
export async function sql(client: Prisma.TransactionClient, text: string, values: unknown[] = []) {
  if (/^\s*(SELECT|WITH)\b/i.test(text) || /\bRETURNING\b/i.test(text)) {
    const rows = await client.$queryRawUnsafe<Record<string, any>[]>(text, ...values);
    return { rows: rows.map(pgValue), rowCount: rows.length };
  }
  return { rows: [] as Record<string, any>[], rowCount: await client.$executeRawUnsafe(text, ...values) };
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
