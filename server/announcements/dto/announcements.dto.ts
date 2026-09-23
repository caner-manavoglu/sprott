import { z } from 'zod';
import { formBoolean, formIds, text } from '../../common/dto.schemas.ts';

export const createAnnouncementSchema = z.object({ title: text(160), body: text(5000), mandatory: formBoolean, groupIds: formIds });
export type CreateAnnouncementDto = z.infer<typeof createAnnouncementSchema>;

export const updateAnnouncementSchema = createAnnouncementSchema.omit({ mandatory: true }).extend({ removeImage: formBoolean });
export type UpdateAnnouncementDto = z.infer<typeof updateAnnouncementSchema>;

