import { z } from 'zod';
import { identifier, text } from '../../common/dto.schemas.ts';

export const createColumnSchema = z.object({ projectId: identifier, name: text(60) });
export type CreateColumnDto = z.infer<typeof createColumnSchema>;

export const renameColumnBodySchema = z.object({ name: text(60) });
export type RenameColumnDto = z.infer<typeof renameColumnBodySchema>;

export const orderColumnsSchema = z.object({ columnIds: z.array(z.number().int().positive().max(2147483647)).min(1) });
export type OrderColumnsDto = z.infer<typeof orderColumnsSchema>;
