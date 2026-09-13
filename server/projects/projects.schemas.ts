import type { SchemaObject } from '@nestjs/swagger';
import { dueDate, id, startDate } from '../common/schemas.ts';

const name = {type: 'string', minLength: 1, maxLength: 80, example: 'Mobil uygulama'} as const;
const description = {type: 'string', maxLength: 2000, example: 'iOS ve Android sürümleri.'} as const;

// Proje tarihleri isteğe bağlıdır ve birbirine göre doğrulanmaz.
const projectDates = {
  startDate: {...startDate, description: 'Projenin başlangıç tarihi; isteğe bağlı, kural uygulanmaz.'},
  endDate: {...dueDate, description: 'Projenin bitiş tarihi; isteğe bağlı, kural uygulanmaz.'},
} as const;
export const newProjectSchema: SchemaObject = {type: 'object', required: ['name'], properties: {name, description, ...projectDates}};
export const editProjectSchema: SchemaObject = {type: 'object', description: 'Gönderilen alanlar güncellenir.', properties: {name, description, ...projectDates}};
export const completionSchema: SchemaObject = {
  type: 'object', required: ['completed'],
  properties: {completed: {type: 'boolean', description: 'true projeyi tamamlar ve panosunu salt okunur yapar; false yeniden açar.', example: true}},
};
export const memberSchema: SchemaObject = {type: 'object', required: ['userId'], properties: {userId: id}};
export const projectSchema: SchemaObject = {
  type: 'object', required: ['id', 'name', 'description', 'columnCount', 'taskCount', 'memberCount'],
  properties: {
    id, name: {type: 'string', example: 'Mobil uygulama'}, description: {type: 'string', example: 'iOS ve Android sürümleri.'},
    columnCount: {type: 'integer', example: 3}, taskCount: {type: 'integer', example: 12}, memberCount: {type: 'integer', example: 4},
    ...projectDates,
    completedAt: {type: 'string', format: 'date', nullable: true, description: 'Dolu ise proje tamamlanmıştır ve panosu salt okunurdur.', example: '2026-09-30'},
  },
};
export const projectsSchema: SchemaObject = {type: 'array', items: projectSchema};
