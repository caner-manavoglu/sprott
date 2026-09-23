import { z } from 'zod';
import { identifier, idList, optionalText, text } from '../../common/dto.schemas.ts';

/** Yalnızca http/https bağlantıları; kayıt URL'nin normalize edilmiş biçimidir. */
const url = text(500).transform((value, context) => {
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString();
  } catch { /* Aşağıdaki hata döner. */ }
  context.addIssue({ code: 'custom', message: 'PR adresi http veya https bağlantısı olmalı.' });
  return z.NEVER;
});

export const createPullRequestSchema = z.object({ projectId: identifier, url, title: text(200), description: optionalText(5000), taskIds: idList.nullable().optional() });
export type CreatePullRequestDto = z.infer<typeof createPullRequestSchema>;

export const updatePullRequestSchema = createPullRequestSchema.omit({ projectId: true }).partial();
export type UpdatePullRequestDto = z.infer<typeof updatePullRequestSchema>;

export const pullRequestStateSchema = z.object({ state: z.enum(['open', 'merged', 'closed']) });
export type PullRequestStateDto = z.infer<typeof pullRequestStateSchema>;
