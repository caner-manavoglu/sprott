import { z } from 'zod';
import { PERMISSIONS } from '../../common/fields.ts';

export const updatePermissionsSchema = z.object({ permissions: z.partialRecord(z.enum(PERMISSIONS), z.boolean()) });
export type UpdatePermissionsDto = z.infer<typeof updatePermissionsSchema>;
