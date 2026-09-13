import type { SchemaObject } from '@nestjs/swagger';
import { id } from '../common/schemas.ts';

const stateSchema: SchemaObject = {
  type: 'string', enum: ['open', 'merged', 'closed'], default: 'open',
  description: '`open` bekliyor, `merged` onaylandı, `closed` merge edilmeden kapatıldı.',
};

export const pullRequestSchema: SchemaObject = {
  type: 'object', required: ['id', 'projectId', 'url', 'title', 'state'], properties: {
    id: {type: 'integer', example: 12},
    projectId: id,
    projectName: {type: 'string', example: 'Mobil uygulama'},
    url: {type: 'string', example: 'https://github.com/owner/repo/pull/42'},
    title: {type: 'string', example: 'Giriş ekranı yeniden yazıldı'},
    description: {type: 'string', example: 'Oturum açma akışı sadeleştirildi.'},
    state: stateSchema,
    mergedAt: {type: 'string', format: 'date-time', nullable: true},
    mergedByName: {type: 'string', nullable: true, description: 'Onaylandı olarak işaretleyen kişi.'},
    createdByName: {type: 'string', nullable: true},
    createdAt: {type: 'string', format: 'date-time'},
    /** Açık PR'ların ne kadar beklediğini listede göstermek için. */
    waitingDays: {type: 'integer', description: 'Eklendiğinden bu yana geçen gün; kapanmış PR’larda da dolu.'},
    tasks: {type: 'array', description: 'Bağlı task’lar.', items: {type: 'object', properties: {
      id, title: {type: 'string'}, columnName: {type: 'string'},
    }}},
  },
};

export const pullRequestsSchema: SchemaObject = {
  type: 'object', required: ['projects', 'projectId', 'tasks', 'rows'], properties: {
    projects: {type: 'array', description: 'PR görüntülenebilen projeler.',
      items: {type: 'object', properties: {id, name: {type: 'string'}}}},
    projectId: {...id, nullable: true, description: 'Listenin getirildiği proje; erişilebilir proje yoksa null.'},
    tasks: {type: 'array', description: 'Projedeki task’lar; PR’a bağlamak için.',
      items: {type: 'object', properties: {id, title: {type: 'string'}}}},
    rows: {type: 'array', description: 'Önce bekleyenler, sonra kapanmışlar; her grupta en eski üstte.',
      items: pullRequestSchema},
  },
};

export const newPullRequestSchema: SchemaObject = {
  type: 'object', required: ['projectId', 'url', 'title'], properties: {
    projectId: id,
    url: {type: 'string', maxLength: 500, example: 'https://github.com/owner/repo/pull/42'},
    title: {type: 'string', minLength: 1, maxLength: 200, example: 'Giriş ekranı yeniden yazıldı'},
    description: {type: 'string', maxLength: 5000, description: 'İsteğe bağlı.'},
    taskIds: {type: 'array', items: {type: 'integer', minimum: 1},
      description: 'Bağlanacak task’lar; hepsi aynı projede olmalıdır. Boş olabilir.', example: [3, 7]},
  },
};

export const editPullRequestSchema: SchemaObject = {
  type: 'object', description: 'Gönderilen alanlar güncellenir. `projectId` değiştirilemez.', properties: {
    url: {type: 'string', maxLength: 500},
    title: {type: 'string', minLength: 1, maxLength: 200},
    description: {type: 'string', maxLength: 5000},
    taskIds: {type: 'array', items: {type: 'integer', minimum: 1}, description: 'Gönderilirse bağlar bu liste ile değiştirilir.'},
  },
};

export const statePullRequestSchema: SchemaObject = {
  type: 'object', required: ['state'], properties: {state: stateSchema},
};
