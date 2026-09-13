import type { SchemaObject } from '@nestjs/swagger';
import { id } from '../common/schemas.ts';

const person: SchemaObject = {type: 'object', required: ['id', 'name'], properties: {
  id, name: {type: 'string', example: 'Ayşe Yılmaz'}, title: {type: 'string', example: 'Yazılım uzmanı'},
}};

export const announcementSchema: SchemaObject = {
  type: 'object', required: ['id', 'title', 'body', 'mandatory', 'createdAt'], properties: {
    id, title: {type: 'string', example: 'Ofis taşınıyor'},
    body: {type: 'string', example: 'Pazartesi itibarıyla yeni adresteyiz.'},
    mandatory: {type: 'boolean', description: 'Açıksa duyuruyu hiç görmemiş kişiye girişte modal olarak açılır.'},
    hasImage: {type: 'boolean', description: 'Doğruysa görsel `GET /api/announcements/:id/image` ile alınır.'},
    groups: {type: 'array', description: 'Hedef gruplar; boş liste duyurunun herkese açık olduğu anlamına gelir.',
      items: {type: 'object', properties: {id, name: {type: 'string', example: 'Frontend'}}}},
    author: {...person, nullable: true, description: 'Duyuruyu yazan kişi; hesap silinmişse null.'},
    readAt: {type: 'string', format: 'date-time', nullable: true, description: 'Okuyan kişinin kendi okuma zamanı.'},
    createdAt: {type: 'string', format: 'date-time'},
    canManage: {type: 'boolean', description: 'Doğruysa okuma raporu görülebilir ve duyuru silinebilir.'},
  },
};
export const announcementsSchema: SchemaObject = {type: 'array', items: announcementSchema};
export const announcementDetailSchema: SchemaObject = {
  type: 'object', description: 'Duyuru ve okuma raporu; rapor yalnızca duyuruyu yazan kişiye ve yöneticilere açıktır.',
  required: ['announcement'], properties: {
    announcement: announcementSchema,
    readers: {type: 'array', description: 'Duyuruyu okuyanlar, okuma zamanıyla.',
      items: {...person, properties: {...person.properties, readAt: {type: 'string', format: 'date-time'}}}},
    pending: {type: 'array', description: 'Duyuruyu henüz okumamış kişiler.', items: person},
  },
};
export const newAnnouncementSchema: SchemaObject = {
  type: 'object', required: ['title', 'body'],
  description: 'multipart/form-data gönderilir; görsel isteğe bağlıdır.',
  properties: {
    title: {type: 'string', minLength: 1, maxLength: 160, example: 'Ofis taşınıyor'},
    body: {type: 'string', minLength: 1, maxLength: 5000, example: 'Pazartesi itibarıyla yeni adresteyiz.'},
    mandatory: {type: 'boolean', default: false},
    groupIds: {type: 'array', items: {type: 'integer', minimum: 1},
      description: 'Hedef gruplar. Yönetici boş bırakırsa duyuru herkese açılır; grup yöneticisi yalnızca yönettiği grupları seçebilir ve boş bırakamaz.',
      example: [1, 2]},
    image: {type: 'string', format: 'binary', description: 'İsteğe bağlı görsel; en fazla 10 MB.'},
  },
};
export const editAnnouncementSchema: SchemaObject = {
  type: 'object', required: ['title', 'body'],
  description: 'multipart/form-data gönderilir. Zorunlu duyurular düzenlenemez; zorunluluk durumu bu uçla değişmez.',
  properties: {
    title: {type: 'string', minLength: 1, maxLength: 160, example: 'Ofis taşınıyor'},
    body: {type: 'string', minLength: 1, maxLength: 5000, example: 'Taşınma salıya ertelendi.'},
    groupIds: {type: 'array', items: {type: 'integer', minimum: 1},
      description: 'Hedef gruplar yeniden yazılır. Hedef genişlerse yalnızca yeni kişilere bildirim düşer.', example: [1]},
    image: {type: 'string', format: 'binary', description: 'Yeni görsel; gönderilmezse mevcut görsel korunur.'},
    removeImage: {type: 'boolean', default: false, description: 'Doğruysa mevcut görsel kaldırılır.'},
  },
};
