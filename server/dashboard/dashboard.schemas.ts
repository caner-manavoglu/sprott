import type { SchemaObject } from '@nestjs/swagger';
import { id } from '../common/schemas.ts';

export const dashboardSchema: SchemaObject = {
  type: 'array',
  description: 'Yönetici tüm projelerin sütun sayımlarını, personel yalnızca kendine atanmış task’ları görür.',
  items: {type: 'object', required: ['id', 'name', 'columns'], properties: {
    id, name: {type: 'string', example: 'Mobil uygulama'},
    columns: {type: 'array', items: {type: 'object', required: ['id', 'name', 'taskCount', 'tasks'], properties: {
      id, name: {type: 'string', example: 'Yapılacak'}, taskCount: {type: 'integer', example: 4},
      tasks: {type: 'array', items: {type: 'object', properties: {id, title: {type: 'string', example: 'Giriş ekranını hazırla'}}}},
    }}},
  }},
};

export const overdueSchema: SchemaObject = {
  type: 'array',
  description: 'Bitiş tarihi geçmiş ve projesinin son (tamamlandı) sütununda olmayan task’lar. '
    + 'Kapsam yetkiye göre daralır: yönetici tüm task’ları, grup yöneticisi yönettiği grupların üyelerinin task’larını, personel yalnızca kendi task’larını görür.',
  items: {type: 'object', required: ['id', 'title', 'dueDate', 'daysLate', 'projectId', 'projectName', 'columnName'], properties: {
    id, title: {type: 'string', example: 'Giriş ekranını hazırla'},
    dueDate: {type: 'string', format: 'date', example: '2026-09-01'},
    daysLate: {type: 'integer', description: 'Bitiş tarihinden bu yana geçen gün sayısı.', example: 11},
    projectId: id, projectName: {type: 'string', example: 'Mobil uygulama'},
    columnName: {type: 'string', example: 'Devam ediyor'},
    assigneeId: {...id, nullable: true},
    assigneeName: {type: 'string', nullable: true, description: 'Atanmamış task’larda null.', example: 'Ayşe Yılmaz'},
  }},
};
