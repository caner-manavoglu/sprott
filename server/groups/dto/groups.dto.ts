import { z } from 'zod';
import { idList, text } from '../../common/dto.schemas.ts';

export const saveGroupSchema = z.object({ name: text(60), memberIds: idList.optional(), managerIds: idList.optional() });
export type SaveGroupDto = z.infer<typeof saveGroupSchema>;
