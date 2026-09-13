import type { SchemaObject } from '@nestjs/swagger';

const profileProperties = {
  name: {type: 'string', minLength: 1, maxLength: 60, example: 'Ayşe'},
  surname: {type: 'string', minLength: 1, maxLength: 60, example: 'Yılmaz'},
  title: {type: 'string', minLength: 1, maxLength: 80, example: 'Yazılım uzmanı'},
  email: {type: 'string', format: 'email', maxLength: 254, example: 'ayse@sprott.local'},
} satisfies SchemaObject['properties'];
export const newUserSchema: SchemaObject = {
  type: 'object', required: ['name', 'surname', 'title', 'email', 'password'],
  properties: {...profileProperties, password: {type: 'string', format: 'password', minLength: 8, maxLength: 256, writeOnly: true}},
};
export const editUserSchema: SchemaObject = {
  type: 'object', required: ['name', 'surname', 'title', 'email'],
  properties: {...profileProperties, password: {type: 'string', format: 'password', minLength: 8, maxLength: 256, writeOnly: true, description: 'Boş bırakılırsa şifre değişmez.'}},
};
