import type { SchemaObject } from '@nestjs/swagger';
import { dueDate, id, startDate } from '../common/schemas.ts';
import { taskPrioritySchema, taskTypeSchema } from '../tasks/tasks.schemas.ts';

export const boardSchema: SchemaObject = {
  type: 'object', required: ['project', 'columns', 'tasks'], properties: {
    project: {type: 'object', required: ['id', 'name', 'description'], properties: {
      id, name: {type: 'string', example: 'Mobil uygulama'}, description: {type: 'string', example: 'iOS ve Android sürümleri.'},
      completedAt: {type: 'string', format: 'date', nullable: true, description: 'Dolu ise pano salt okunurdur.', example: '2026-09-30'},
    }},
    columns: {type: 'array', items: {type: 'object', required: ['id', 'name'], properties: {id, name: {type: 'string', example: 'Yapılacak'}}}},
    transitions: {type: 'array', description: 'Projenin akış kuralları; boş liste tüm geçişlerin serbest olduğu anlamına gelir.',
      items: {type: 'object', required: ['fromColumnId', 'toColumnId'], properties: {fromColumnId: id, toColumnId: id}}},
    tasks: {type: 'array', items: {type: 'object', required: ['id', 'title', 'description', 'columnId', 'createdBy'], properties: {
      id, title: {type: 'string', example: 'Giriş ekranını hazırla'}, description: {type: 'string', example: 'Yönetici ve kullanıcı girişlerini ekle.'},
      columnId: id,
      createdBy: {...id, description: 'Task’ı açan (raporlayan) kişi. Oluşturulduktan sonra değiştirilemez.'},
      createdByName: {type: 'string', nullable: true, description: 'Raporlayanın adı; kullanıcı silinmişse null.'},
      assigneeId: {...id, nullable: true, description: 'Atanmamış task’larda null.'},
      parentTaskId: {...id, nullable: true}, parentTitle: {type: 'string', nullable: true},
      startDate, dueDate,
      type: taskTypeSchema, priority: taskPrioritySchema,
      attachments: {type: 'array', items: {type: 'object', properties: {
        id, name: {type: 'string'}, mimeType: {type: 'string'}, size: {type: 'integer'},
      }}},
      pullRequests: {type: 'array', description: 'Task’a bağlı PR’lar; `open` olanlar kartta rozetle gösterilir.',
        items: {type: 'object', properties: {
          id: {type: 'integer'}, url: {type: 'string'}, title: {type: 'string'},
          state: {type: 'string', enum: ['open', 'merged', 'closed']},
        }}},
    }}},
  },
};
export const columnSchema: SchemaObject = {type: 'object', required: ['name', 'projectId'], properties: {
  name: {type: 'string', minLength: 1, maxLength: 60, example: 'İnceleme'}, projectId: id,
}};
export const renameColumnSchema: SchemaObject = {type: 'object', required: ['name'], properties: {name: {type: 'string', minLength: 1, maxLength: 60, example: 'İnceleme'}}};
export const orderSchema: SchemaObject = {type: 'object', required: ['columnIds'], properties: {
  columnIds: {type: 'array', items: {type: 'integer', minimum: 1}, description: 'Tek bir projenin tüm sütunları, yeni sırasıyla.', example: [3, 1, 2]},
}};
