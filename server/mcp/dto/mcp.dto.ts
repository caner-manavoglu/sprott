import { z } from 'zod';
import { text } from '../../common/dto.schemas.ts';

export const issueTokenSchema = z.object({ name: text(80).optional() }).default({});
export type IssueTokenDto = z.infer<typeof issueTokenSchema>;
