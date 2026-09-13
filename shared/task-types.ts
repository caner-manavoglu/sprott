export const taskTypes = ['task', 'bug', 'story', 'epic', 'subtask', 'feature'] as const;
export type TaskType = typeof taskTypes[number];
