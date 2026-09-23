import { z } from 'zod';
import { taskPriorities } from '../../../shared/task-priorities.ts';
import { taskTypes } from '../../../shared/task-types.ts';
import { date, formIds, identifier, optionalId, text } from '../../common/dto.schemas.ts';

const taskFields = { title: text(160), description: text(5000), columnId: identifier, assigneeId: optionalId, parentTaskId: optionalId, type: z.enum(taskTypes), priority: z.enum(taskPriorities), startDate: date, dueDate: date };

export const createTaskSchema = z.object({ ...taskFields, type: taskFields.type.default('task'), priority: taskFields.priority.default('normal') });
export type CreateTaskDto = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z.object(taskFields).partial();
export type UpdateTaskDto = z.infer<typeof updateTaskSchema>;

export const taskCommentSchema = z.object({ body: text(5000), mentions: formIds });
export type TaskCommentDto = z.infer<typeof taskCommentSchema>;
