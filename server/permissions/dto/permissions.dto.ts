import { z } from 'zod';
import { PERMISSIONS } from '../../common/fields.ts';

export const updatePermissionsSchema = z.object({ permissions: z.record(z.string().refine(key => PERMISSIONS.includes(key as typeof PERMISSIONS[number])), z.boolean()) });
export type UpdatePermissionsDto = z.infer<typeof updatePermissionsSchema>;

