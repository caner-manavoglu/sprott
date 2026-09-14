import type { SchemaObject } from '@nestjs/swagger';
import { dueDate, id, startDate } from '../common/schemas.ts';
import { taskTypes } from '../../shared/task-types.ts';
import { taskPriorities } from '../../shared/task-priorities.ts';
export const taskTypeSchema: SchemaObject = {type: 'string', enum: [...taskTypes], default: 'task'};
export const taskPrioritySchema: SchemaObject = {type: 'string', enum: [...taskPriorities], default: 'normal',
  description: 'Task önceliği; en yüksek öncelik panoda ayrı işaretlenir.'};

export const taskSchema: SchemaObject = {type: 'object', required: ['title', 'description', 'columnId'], properties: {
  type: taskTypeSchema, priority: taskPrioritySchema,
  title: {type: 'string', minLength: 1, maxLength: 160, example: 'Giriş ekranını hazırla'},
  description: {type: 'string', minLength: 1, maxLength: 5000, example: 'Yönetici ve kullanıcı girişlerini ekle.'}, columnId: id,
  assigneeId: {...id, nullable: true, description: 'Proje üyelerinden biri; boş bırakılırsa atanmamış olur.'},
  parentTaskId: {...id, nullable: true, description: 'Sub-task türünde zorunlu olan ana task.'},
  startDate, dueDate,
}};
export const editTaskSchema: SchemaObject = {type: 'object',
  description: 'Gönderilen alanlar güncellenir. Raporlayan (`createdBy`) burada yer almaz; oluşturulduktan sonra değiştirilemez.',
  properties: {
  type: taskTypeSchema, priority: taskPrioritySchema,
  columnId: id, title: {type: 'string', minLength: 1, maxLength: 160}, description: {type: 'string', minLength: 1, maxLength: 5000},
  assigneeId: {...id, nullable: true, description: 'null gönderilirse atama kaldırılır.'},
  parentTaskId: {...id, nullable: true, description: 'Sub-task’ın bağlı olduğu ana task.'},
  startDate, dueDate,
}};
export const taskSearchSchema: SchemaObject = {
  type: 'array', description: 'Aramaya uyan task’lar; yalnızca erişilebilen projelerden, en yeniden eskiye, en fazla 20 kayıt.',
  items: {type: 'object', required: ['id', 'title', 'columnId', 'projectId'], properties: {
    id, title: {type: 'string', example: 'Giriş ekranını hazırla'},
    type: taskTypeSchema, priority: taskPrioritySchema,
    columnId: id, columnName: {type: 'string', example: 'Yapılacak'},
    projectId: id, projectName: {type: 'string', example: 'Mobil uygulama'},
  }},
};

export const myTasksSchema: SchemaObject = {
  type: 'array', description: 'Oturumdaki kullanıcıya atanmış, henüz tamamlanmamış task’lar; teslim tarihi yakın olan üstte.',
  items: {type: 'object', required: ['id', 'title', 'columnId', 'projectId'], properties: {
    id, title: {type: 'string', example: 'Giriş ekranını hazırla'},
    type: taskTypeSchema, priority: taskPrioritySchema,
    startDate: {type: 'string', nullable: true, example: '2026-01-05'},
    dueDate: {type: 'string', nullable: true, example: '2026-01-12'},
    columnId: id, columnName: {type: 'string', example: 'Yapılacak'},
    projectId: id, projectName: {type: 'string', example: 'Mobil uygulama'},
  }},
};
