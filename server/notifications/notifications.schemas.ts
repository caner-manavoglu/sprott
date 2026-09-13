import type { SchemaObject } from '@nestjs/swagger';
import { id } from '../common/schemas.ts';

export const notificationsSchema: SchemaObject = {
  type: 'object',
  description: 'Kişinin son 50 bildirimi ve okunmamış sayısı. Bildirim metni istemcide türe göre üretilir.',
  required: ['items', 'unread'],
  properties: {
    unread: {type: 'integer', description: 'Okunmamış bildirim sayısı; ikonda 9’dan sonrası 9+ gösterilir.', example: 3},
    items: {type: 'array', items: {type: 'object', required: ['id', 'type'], properties: {
      id,
      type: {type: 'string', enum: ['assigned', 'completed', 'mention', 'comment', 'announcement'], example: 'assigned'},
      taskId: {...id, nullable: true, description: 'Duyuru bildirimlerinde null.'},
      taskTitle: {type: 'string', nullable: true, example: 'Giriş ekranını hazırla'},
      taskType: {type: 'string', nullable: true, example: 'bug'},
      projectId: {...id, nullable: true}, projectName: {type: 'string', nullable: true, example: 'Mobil uygulama'},
      announcementId: {...id, nullable: true, description: 'Duyuru bildirimlerinde dolu; okundu işareti duyuruyla ortaktır.'},
      announcementTitle: {type: 'string', nullable: true, example: 'Ofis taşınıyor'},
      announcementMandatory: {type: 'boolean', nullable: true},
      actorName: {type: 'string', nullable: true, description: 'Bildirimi doğuran kişi; silinmişse null.', example: 'Ayşe Yılmaz'},
      readAt: {type: 'string', format: 'date-time', nullable: true},
      createdAt: {type: 'string', format: 'date-time'},
    }}},
  },
};
