import { z } from 'zod';

export const identifier = z.union([z.number().int().positive().max(2147483647), z.string().regex(/^\d+$/).refine(value => Number(value) > 0 && Number(value) <= 2147483647)]);
export const text = (max: number) => z.string().trim().min(1).max(max);
export const date = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')]).nullable().optional();
export const optionalId = z.union([identifier, z.literal('')]).nullable().optional();
export const formBoolean = z.union([z.boolean(), z.enum(['true', 'false'])]).optional();
export const formIds = z.union([z.array(identifier), z.string()]).nullable().optional();
