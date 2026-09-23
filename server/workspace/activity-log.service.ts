import { Inject, Injectable } from '@nestjs/common';
import type { User } from '../common/fields.ts';
import { PrismaService } from '../prisma/prisma.service.ts';

export type LogAction = 'task.create' | 'task.move' | 'task.assign' | 'task.delete' | 'comment.create' | 'pr.link' | 'pr.unlink' | 'pr.merge';

@Injectable()
export class ActivityLogService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) { }
  /**
   * Etkinlik günlüğüne kayıt ekler. Günlük yalnızca büyür: hiçbir yerde
   * güncellenmez veya silinmez, API'de yalnızca GET ucu vardır.
   * Task adı ve kişi adı anlık kopyalanır, böylece kayıt silinse de geçmiş okunur kalır.
   */
  async log(entry: { projectId: number; taskId: number | null; taskTitle: string; action: LogAction; detail?: string | null; actor: User }) {
    await this.prisma.activityLog.create({
      data: {
        projectId: entry.projectId, taskId: entry.taskId, taskTitle: entry.taskTitle, action: entry.action,
        detail: entry.detail ?? null, actorId: entry.actor.id, actorName: `${entry.actor.name} ${entry.actor.surname}`.trim(),
      },
    });
  }
}
