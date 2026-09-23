import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { allow, type AuthRequest } from '../common/auth.ts';
import { idField } from '../common/fields.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { WorkspaceService } from '../workspace/workspace.service.ts';
import { type SaveWorkflowDto } from './dto/workflow.dto.ts';

type Transition = { fromColumnId: number; toColumnId: number };

@Injectable()
export class WorkflowService {
  constructor(@Inject(WorkspaceService) private workspace: WorkspaceService, @Inject(PrismaService) private prisma: PrismaService) { }
  private async current(projectId: number): Promise<Transition[]> {
    return (await this.prisma.workflowTransition.findMany({ where: { projectId }, select: { fromColumnId: true, toColumnId: true }, }));
  }
  private async pairs(projectId: number, value: unknown): Promise<Transition[]> {
    if (!Array.isArray(value)) throw new BadRequestException('Akış kuralları listesi geçersiz.');
    const columnIds = (await this.prisma.column.findMany({ where: { projectId }, select: { id: true }, })).map(row => row.id as number);
    const seen = new Set<string>(), pairs: Transition[] = [];
    for (const item of value) {
      if (!item || typeof item !== 'object') throw new BadRequestException('Akış kuralları listesi geçersiz.');
      const fromColumnId = idField((item as Transition).fromColumnId), toColumnId = idField((item as Transition).toColumnId);
      if (!columnIds.includes(fromColumnId) || !columnIds.includes(toColumnId)) throw new BadRequestException('Akış kuralı yalnızca projenin sütunları arasında tanımlanabilir.');
      if (fromColumnId === toColumnId) continue;
      const key = `${fromColumnId}-${toColumnId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ fromColumnId, toColumnId });
    }
    return pairs;
  }
  async index(req: AuthRequest, id: string) {
    const user = allow(req, 'workflow.view');
    const projectId = await this.workspace.reachable(user, idField(id));
    const transitions = await this.current(projectId);
    return { enabled: transitions.length > 0, transitions };
  }
  async save(req: AuthRequest, id: string, body: SaveWorkflowDto) {
    // İlk kez kural yazmak "oluşturma", var olanı değiştirmek "güncelleme" yetkisine bağlıdır.
    const projectId = idField(id);
    const exists = (await this.prisma.workflowTransition.count({ where: { projectId }, }));
    const user = allow(req, exists ? 'workflow.update' : 'workflow.create');
    await this.workspace.reachable(user, projectId);
    const pairs = await this.pairs(projectId, body.transitions);
    if (!pairs.length) throw new BadRequestException('En az bir geçiş seçmelisiniz. Kuralları tamamen kaldırmak için akışı kapatın.');
    await this.workspace.transaction(async client => {
      await client.workflowTransition.deleteMany({ where: { projectId }, });
      for (const pair of pairs) (await client.workflowTransition.create({ data: { projectId, fromColumnId: pair.fromColumnId, toColumnId: pair.toColumnId } }));
    });
    return { enabled: true, transitions: await this.current(projectId) };
  }
  async clear(req: AuthRequest, id: string) {
    const user = allow(req, 'workflow.delete');
    const projectId = await this.workspace.reachable(user, idField(id));
    await this.prisma.workflowTransition.deleteMany({ where: { projectId }, });
    return { enabled: false, transitions: [] };
  }
}
