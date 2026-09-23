import { z } from 'zod';
import { identifier, text } from '../../common/dto.schemas.ts';

export const saveForumSchema = z.object({ name: text(100), description: z.string().max(2000) });
export type SaveForumDto = z.infer<typeof saveForumSchema>;

export const messageReceiptsSchema = z.object({ ids: z.array(identifier).max(500), kind: z.enum(['delivered', 'read']) });
export type MessageReceiptsDto = z.infer<typeof messageReceiptsSchema>;

export const sendMessageSchema = z.object({ body: z.string().trim().max(5000) });
export type SendMessageDto = z.infer<typeof sendMessageSchema>;

export const editMessageSchema = z.object({ body: text(5000) });
export type EditMessageDto = z.infer<typeof editMessageSchema>;

