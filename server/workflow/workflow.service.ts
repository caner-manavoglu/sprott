import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { allow } from '../common/auth.ts';
import type { User } from '../common/fields.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { AccessService } from '../workspace/access.service.ts';
import { type SaveWorkflowDto } from './dto/workflow.dto.ts';

type Transition = { fromColumnId: number; toColumnId: number };

@Injectable()
export class WorkflowService {
  constructor(@Inject(AccessService) private access: AccessService, @Inject(PrismaService) private prisma: PrismaService) { }
  private current(projectId: number): Promise<Transition[]> {
    return this.prisma.workflowTransition.findMany({ where: { projectId }, select: { fromColumnId: true, toColumnId: true } });
  }
  private async pairs(projectId: number, transitions: Transition[]) {
    const columnIds = (await this.prisma.column.findMany({ where: { projectId }, select: { id: true } })).map(row => row.id);
    const pairs = new Map<string, Transition>();
    for (const { fromColumnId, toColumnId } of transitions) {
      if (!columnIds.includes(fromColumnId) || !columnIds.includes(toColumnId)) throw new BadRequestException('Akış kuralı yalnızca projenin sütunları arasında tanımlanabilir.');
      if (fromColumnId !== toColumnId) pairs.set(`${fromColumnId}-${toColumnId}`, { fromColumnId, toColumnId });
    }
    return [...pairs.values()];
  }
  async index(user: User, id: number) {
    allow(user, 'workflow.view');
    const transitions = await this.current(await this.access.reachable(user, id));
    return { enabled: transitions.length > 0, transitions };
  }
  async save(user: User, projectId: number, body: SaveWorkflowDto) {
    // İlk kez kural yazmak "oluşturma", var olanı değiştirmek "güncelleme" yetkisine bağlıdır.
    const exists = await this.prisma.workflowTransition.count({ where: { projectId } });
    allow(user, exists ? 'workflow.update' : 'workflow.create');
    await this.access.reachable(user, projectId);
    const pairs = await this.pairs(projectId, body.transitions);
    if (!pairs.length) throw new BadRequestException('En az bir geçiş seçmelisiniz. Kuralları tamamen kaldırmak için akışı kapatın.');
    await this.prisma.$transaction([
      this.prisma.workflowTransition.deleteMany({ where: { projectId } }),
      this.prisma.workflowTransition.createMany({ data: pairs.map(pair => ({ projectId, ...pair })) }),
    ]);
    return { enabled: true, transitions: await this.current(projectId) };
  }
  async clear(user: User, id: number) {
    allow(user, 'workflow.delete');
    const projectId = await this.access.reachable(user, id);
    await this.prisma.workflowTransition.deleteMany({ where: { projectId } });
    return { enabled: false, transitions: [] };
  }
}
