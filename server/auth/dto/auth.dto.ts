import { z } from 'zod';
import { text } from '../../common/dto.schemas.ts';

// Rol veritabanından okunur; eski istemcilerin gönderdiği `role` alanı yok sayılır.
export const loginBodySchema = z.object({ email: text(254).toLowerCase(), password: z.string().max(256) });
export type LoginDto = z.infer<typeof loginBodySchema>;
