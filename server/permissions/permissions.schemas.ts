import type { SchemaObject } from '@nestjs/swagger';

export const permissionSchema: SchemaObject = {
  type: 'object', required: ['permissions'],
  properties: {permissions: {type: 'object', additionalProperties: {type: 'boolean'}, example: {'task.view': true, 'task.create': true, 'task.update': false, 'task.delete': false}}},
};
export const definitionsSchema: SchemaObject = {
  type: 'array', items: {type: 'object', required: ['key', 'label'], properties: {key: {type: 'string', example: 'task.create'}, label: {type: 'string', example: 'Task oluşturma'}}},
};
