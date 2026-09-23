import { z } from 'zod';
import { formBoolean, text } from '../../common/dto.schemas.ts';

export const createUserSchema = z.object({ name: text(60), surname: text(60), title: text(80), email: text(254), password: z.string().min(8).max(256) });
export type CreateUserDto = z.infer<typeof createUserSchema>;

export const updateUserSchema = createUserSchema.extend({ password: z.union([z.string().min(8).max(256), z.literal('')]).optional() });
export type UpdateUserDto = z.infer<typeof updateUserSchema>;

export const updateProfileSchema = z.object({ email: text(254), password: z.union([z.string().min(8).max(256), z.literal('')]).optional(), removeAvatar: formBoolean });
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;

