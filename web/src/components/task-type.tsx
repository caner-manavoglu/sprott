import { BookOpen, Bug, Check, Layers, Sparkles, Zap } from 'lucide-react';
import { taskTypes, type TaskType } from '../../../shared/task-types';

export const taskTypeLabels = {task: 'Task', bug: 'Bug', story: 'Story', epic: 'Epic', subtask: 'Sub-task', feature: 'Feature'};
const icons = {task: Check, bug: Bug, story: BookOpen, epic: Zap, subtask: Layers, feature: Sparkles};
export const taskTypeOptions = taskTypes.map(value => ({value, label: taskTypeLabels[value]}));

export function TaskTypeBadge({type}: {type: TaskType}) {
  const Icon = icons[type];
  return <span className="task-kind" data-type={type}><Icon size={13}/>{taskTypeLabels[type]}</span>;
}
