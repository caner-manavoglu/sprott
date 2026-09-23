import { z } from 'zod';
import { identifier } from '../../common/dto.schemas.ts';

export const saveWorkflowSchema = z.object({ transitions: z.array(z.object({ fromColumnId: identifier, toColumnId: identifier })) });
export type SaveWorkflowDto = z.infer<typeof saveWorkflowSchema>;
