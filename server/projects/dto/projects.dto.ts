import { z } from 'zod';
import { date, identifier, optionalText, text } from '../../common/dto.schemas.ts';

export const createProjectSchema = z.object({ name: text(80), description: optionalText(2000), startDate: date, endDate: date });
export type CreateProjectDto = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = createProjectSchema.partial();
export type UpdateProjectDto = z.infer<typeof updateProjectSchema>;

export const projectCompletionSchema = z.object({ completed: z.boolean() });
export type ProjectCompletionDto = z.infer<typeof projectCompletionSchema>;

export const projectMemberSchema = z.object({ userId: identifier });
export type ProjectMemberDto = z.infer<typeof projectMemberSchema>;
