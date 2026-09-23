import type { SchemaObject } from '@nestjs/swagger';
import { id } from '../common/schemas.ts';

export const logSchema: SchemaObject = {
  type: 'object', required: ['projects', 'tasks', 'actors', 'rows', 'total', 'page', 'pageSize'],
  description: 'Seçilen projenin filtre listeleri ve sayfalanmış etkinlik günlüğü. Günlük yalnızca okunur.',
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
    actors: {
      type: 'array', description: 'Projede kaydı bulunan personel; günlüğü kişiye göre daraltmak için.',
      items: {type: 'object', required: ['id', 'name'], properties: {id, name: {type: 'string', example: 'Ayşe Yılmaz'}}},
    },
    rows: {
      type: 'array', description: 'İstenen sayfanın kayıtları; yeniden eskiye sıralı.',
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
    total: {type: 'integer', description: 'Filtrelere uyan toplam kayıt sayısı.', example: 137},
    page: {type: 'integer', description: 'Getirilen sayfa; 1’den başlar.', example: 1},
    pageSize: {type: 'integer', description: 'Sayfa başına kayıt sayısı.', example: 50},
  },
};
