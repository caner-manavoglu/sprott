import { z } from 'zod';
import { email, formBoolean, optionalPassword, password, text } from '../../common/dto.schemas.ts';

export const createUserSchema = z.object({ name: text(60), surname: text(60), title: text(80), email, password });
export type CreateUserDto = z.infer<typeof createUserSchema>;

export const updateUserSchema = createUserSchema.extend({ password: optionalPassword });
export type UpdateUserDto = z.infer<typeof updateUserSchema>;

export const updateProfileSchema = z.object({ email, password: optionalPassword, removeAvatar: formBoolean });
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;
