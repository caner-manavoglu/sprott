import { z } from 'zod';
import { text } from '../../common/dto.schemas.ts';

export const loginBodySchema = z.object({ email: text(254), password: z.string().max(256), role: z.enum(['admin', 'user']) });
export type LoginDto = z.infer<typeof loginBodySchema>;

