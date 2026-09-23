import { z } from 'zod';
import { identifier, text } from '../../common/dto.schemas.ts';

export const createPullRequestSchema = z.object({ projectId: identifier, url: text(500), title: text(200), description: z.string().trim().max(5000).optional(), taskIds: z.array(identifier).nullable().optional() });
export type CreatePullRequestDto = z.infer<typeof createPullRequestSchema>;

export const updatePullRequestSchema = createPullRequestSchema.omit({ projectId: true }).partial();
export type UpdatePullRequestDto = z.infer<typeof updatePullRequestSchema>;

export const pullRequestStateSchema = z.object({ state: z.enum(['open', 'merged', 'closed']) });
export type PullRequestStateDto = z.infer<typeof pullRequestStateSchema>;

