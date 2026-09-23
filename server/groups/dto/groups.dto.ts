import { z } from 'zod';
import { identifier, text } from '../../common/dto.schemas.ts';

export const saveGroupSchema = z.object({ name: text(60), memberIds: z.array(identifier).optional(), managerIds: z.array(identifier).optional() });
export type SaveGroupDto = z.infer<typeof saveGroupSchema>;

