import type { SchemaObject } from '@nestjs/swagger';
import { id } from '../common/schemas.ts';
import { overdueSchema } from '../dashboard/dashboard.schemas.ts';

export const reportSchema: SchemaObject = {
  type: 'object', required: ['scope', 'rows', 'total'],
  properties: {
    scope: {type: 'string', enum: ['all', 'group', 'self'], description: 'all: tüm kullanıcılar, group: yönettiği grupların üyeleri, self: yalnızca kendisi.', example: 'group'},
    groups: {type: 'array', description: 'Grup kapsamında rapor alınan grupların adları.', items: {type: 'string', example: 'Mobil ekibi'}},
    total: {type: 'integer', description: 'Kapsamdaki tamamlanan task sayısı toplamı.', example: 12},
    rows: {type: 'array', items: {type: 'object', required: ['id', 'name', 'surname', 'title', 'completed'], properties: {
      id, name: {type: 'string', example: 'Ayşe'}, surname: {type: 'string', example: 'Yılmaz'},
      title: {type: 'string', example: 'Yazılım uzmanı'},
      assigned: {type: 'integer', description: 'Kişiye şu anda atanmış tüm task’lar.', example: 8},
      completed: {type: 'integer', example: 5},
      bugs: {type: 'integer', description: 'Görülebilen projelerde kişiye şu anda atanmış tüm bug’lar; tamamlananlar dahil.', example: 2},
      overdue: {type: 'integer', description: 'Bitiş tarihi geçmiş ve tamamlanmamış task sayısı.', example: 1},
    }}},
  },
};

export const reportDetailSchema: SchemaObject = {
  type: 'object', required: ['person', 'rows', 'total'],
  properties: {
    person: {type: 'object', required: ['id', 'name', 'surname', 'title'], properties: {
      id, name: {type: 'string', example: 'Ayşe'}, surname: {type: 'string', example: 'Yılmaz'}, title: {type: 'string', example: 'Yazılım uzmanı'},
    }},
    total: {type: 'integer', example: 7},
    rows: {type: 'array', description: 'Personelin üyesi olduğu projeler ve o projede tamamladığı task sayısı.', items: {
      type: 'object', required: ['projectId', 'projectName', 'completed'],
      properties: {
        projectId: {type: 'integer', example: 1}, projectName: {type: 'string', example: 'Mobil uygulama'},
        assigned: {type: 'integer', description: 'Kişiye bu projede atanmış tüm task’lar.', example: 6},
        completed: {type: 'integer', example: 3},
        bugs: {type: 'integer', description: 'Projede kişiye şu anda atanmış bug sayısı; tamamlananlar dahil.', example: 2},
        overdue: {type: 'integer', description: 'Projede bitiş tarihi geçmiş ve tamamlanmamış task sayısı.', example: 1},
      },
    }},
    overdue: {...overdueSchema, description: 'Personelin süresi geçen task’ları; hangi task, hangi projede ve kaç gün gecikmiş.'},
  },
};
