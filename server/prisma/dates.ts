/** DATE columns represent calendar dates, independent of the server's timezone. */
export const dbDate = (value: string | null) => value === null ? null : new Date(`${value}T00:00:00.000Z`);
