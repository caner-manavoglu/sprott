export const taskPriorities = ['lowest', 'low', 'normal', 'high', 'highest'] as const;
export type TaskPriority = typeof taskPriorities[number];
