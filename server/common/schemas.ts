import type { SchemaObject } from '@nestjs/swagger';

export const id: SchemaObject = {type: 'integer', minimum: 1, maximum: 2147483647, example: 1};
export const startDate: SchemaObject = {
  type: 'string', format: 'date', nullable: true, example: '2026-09-12',
  description: 'Başlangıç tarihi. Bugünden en fazla bir ay öncesi seçilebilir; boş bırakılabilir.',
};
export const dueDate: SchemaObject = {
  type: 'string', format: 'date', nullable: true, example: '2026-09-30',
  description: 'Bitiş tarihi. Üst sınırı yoktur, başlangıçtan önce olamaz; boş bırakılabilir.',
};
export const userSchema: SchemaObject = {
  type: 'object', required: ['id', 'name', 'surname', 'title', 'email', 'role', 'permissions'],
  properties: {
    id, name: {type: 'string', example: 'Ayşe'}, surname: {type: 'string', example: 'Yılmaz'}, title: {type: 'string', example: 'Yazılım uzmanı'},
    email: {type: 'string', format: 'email', example: 'personel@sprott.local'},
    role: {type: 'string', enum: ['admin', 'user']},
    hasAvatar: {type: 'boolean', example: false},
    permissions: {type: 'object', additionalProperties: {type: 'boolean'}, description: 'Yalnızca açık yetkiler tutulur; yöneticiler tüm yetkilere sahiptir.', example: {'task.view': true, 'task.create': true}},
    managedGroups: {
      type: 'array', items: {type: 'string', example: 'Mobil ekibi'},
      description: 'Kişinin yöneticisi olduğu grupların adları; grup modülünden yönetici eklenip çıkarıldıkça değişir.',
    },
  },
};
export const usersSchema: SchemaObject = {type: 'array', items: userSchema};
