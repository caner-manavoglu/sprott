import type { SchemaObject } from '@nestjs/swagger';
import { id } from '../common/schemas.ts';

export const logSchema: SchemaObject = {
  type: 'object', required: ['projects', 'tasks', 'rows'],
  description: 'Seçilen projenin task listesi ve kronolojik etkinlik günlüğü. Günlük yalnızca okunur.',
  properties: {
    projects: {
      type: 'array', description: 'Günlüğü görüntülenebilen projeler.',
      items: {type: 'object', required: ['id', 'name'], properties: {id, name: {type: 'string', example: 'Mobil uygulama'}}},
    },
    projectId: {...id, nullable: true, description: 'Günlüğün getirildiği proje; erişilebilir proje yoksa null.'},
    tasks: {
      type: 'array', description: 'Projedeki güncel task’lar; günlüğü task’a göre daraltmak için.',
      items: {type: 'object', required: ['id', 'title'], properties: {id, title: {type: 'string', example: 'Giriş ekranını hazırla'}}},
    },
    rows: {
      type: 'array', description: 'Eskiden yeniye kronolojik kayıtlar.',
      items: {type: 'object', required: ['id', 'action', 'taskTitle', 'actorName', 'createdAt'], properties: {
        id: {type: 'integer', example: 42},
        action: {type: 'string', enum: ['task.create', 'task.move', 'task.assign', 'task.delete', 'comment.create'], example: 'task.move'},
        detail: {type: 'string', nullable: true, description: 'Sütun değişiminde “Yapılacak → Devam ediyor”, atama değişiminde “Ali Veli → Ayşe Yılmaz”.', example: 'Yapılacak → Devam ediyor'},
        taskId: {...id, nullable: true, description: 'Silinen task’larda null.'},
        taskTitle: {type: 'string', example: 'Giriş ekranını hazırla'},
        actorId: {...id, nullable: true},
        actorName: {type: 'string', example: 'Ayşe Yılmaz'},
        createdAt: {type: 'string', format: 'date-time', example: '2026-09-12T14:05:00.000Z'},
      }},
    },
  },
};
