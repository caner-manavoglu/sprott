import type { SchemaObject } from '@nestjs/swagger';
import { userSchema } from '../common/schemas.ts';

export const loginSchema: SchemaObject = {
  type: 'object', required: ['email', 'password', 'role'], properties: {
    email: {type: 'string', format: 'email', maxLength: 254, example: 'admin@sprott.local'},
    password: {type: 'string', format: 'password', maxLength: 256, writeOnly: true},
    role: {type: 'string', enum: ['admin', 'user'], example: 'admin'},
  },
};
export const sessionSchema: SchemaObject = {
  type: 'object', required: [...userSchema.required!, 'token'],
  properties: {...userSchema.properties, token: {type: 'string', description: 'Authorize düğmesine girilecek bearer token.', example: '9f8c…'}},
};
