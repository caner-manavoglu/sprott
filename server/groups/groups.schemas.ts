import type { SchemaObject } from '@nestjs/swagger';
import { id } from '../common/schemas.ts';

const memberSchema: SchemaObject = {
  type: 'object', required: ['id', 'name', 'surname', 'title'],
  properties: {id, name: {type: 'string', example: 'Ayşe'}, surname: {type: 'string', example: 'Yılmaz'}, title: {type: 'string', example: 'Yazılım uzmanı'}},
};
export const groupSchema: SchemaObject = {
  type: 'object', required: ['id', 'name', 'members', 'managers'],
  properties: {id, name: {type: 'string', example: 'Frontend'}, members: {type: 'array', items: memberSchema}, managers: {type: 'array', items: memberSchema}},
};
export const groupsSchema: SchemaObject = {type: 'array', items: groupSchema};
export const membersSchema: SchemaObject = {type: 'array', items: memberSchema};
export const editGroupSchema: SchemaObject = {
  type: 'object', required: ['name'],
  properties: {
    name: {type: 'string', minLength: 1, maxLength: 60, example: 'Frontend'},
    memberIds: {type: 'array', items: {type: 'integer', minimum: 1}, description: 'Gruptaki kullanıcıların tamamı; gönderilmezse üyelikler değişmez.', example: [2, 3]},
    managerIds: {type: 'array', items: {type: 'integer', minimum: 1}, description: 'Grup yöneticileri; boş bırakılabilir. Yöneticiler grup üyelerinin task’larını panoda geri alabilir.', example: [2]},
  },
};
