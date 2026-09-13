import type { SchemaObject } from '@nestjs/swagger';
import { id } from '../common/schemas.ts';

const transition: SchemaObject = {
  type: 'object', required: ['fromColumnId', 'toColumnId'],
  properties: {fromColumnId: id, toColumnId: id},
};

export const workflowSchema: SchemaObject = {
  type: 'object', required: ['enabled', 'transitions'],
  description: 'Projenin akış kuralları. `enabled` false ise kural yoktur ve tüm geçişler serbesttir.',
  properties: {
    enabled: {type: 'boolean', example: true},
    transitions: {type: 'array', items: transition},
  },
};

export const workflowBodySchema: SchemaObject = {
  type: 'object', required: ['transitions'],
  properties: {transitions: {type: 'array', description: 'İzin verilen sütun geçişleri; liste tümüyle değiştirilir.', items: transition}},
};
