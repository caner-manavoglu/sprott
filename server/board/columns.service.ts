import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { allow, type AuthRequest } from '../common/auth.ts';
import { idField, textField } from '../common/fields.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { sql } from '../prisma/sql.ts';
import { WorkspaceService } from '../workspace/workspace.service.ts';
import { type CreateColumnDto, type OrderColumnsDto, type RenameColumnDto } from './dto/columns.dto.ts';

@Injectable()
export class ColumnsService {
  constructor(@Inject(WorkspaceService) private workspace: WorkspaceService, @Inject(PrismaService) private prisma: PrismaService) { }
  private async scope(req: AuthRequest, projectId: number) {
    return this.workspace.writable(allow(req, 'project.update'), projectId);
  }
  async add(req: AuthRequest, body: CreateColumnDto) {
    const projectId = await this.scope(req, idField(body.projectId)), name = textField(body.name, 'Sütun adı', 60);
    await this.workspace.transaction(async client => {
      await sql(client, 'LOCK TABLE columns IN EXCLUSIVE MODE');
      const last = await client.column.aggregate({ where: { projectId }, _max: { position: true } });
      await client.column.create({ data: { name, projectId, position: (last._max.position ?? 0) + 1 } });
    });
    return this.workspace.board(projectId);
  }
  async reorder(req: AuthRequest, body: OrderColumnsDto) {
    if (!Array.isArray(body.columnIds) || !body.columnIds.length || !body.columnIds.every(id => typeof id === 'number')) throw new BadRequestException('Geçersiz sütun sırası.');
    const ids = body.columnIds.map(idField);
    const projectId = await this.scope(req, await this.workspace.columnProject(ids[0]));
    await this.workspace.transaction(async client => {
      await sql(client, 'LOCK TABLE columns IN EXCLUSIVE MODE');
      const existing = (await client.column.findMany({ where: { projectId }, select: { id: true }, })).map(row => row.id);
      if (ids.length !== existing.length || new Set(ids).size !== ids.length || ids.some(id => !existing.includes(id))) throw new BadRequestException('Projenin her sütununu tam bir kez gönderin. Panoyu yenileyip tekrar deneyin.');
      for (const [index, id] of ids.entries()) await client.column.update({ where: { id }, data: { position: index + 1 } });
    });
    return this.workspace.board(projectId);
  }
  async rename(req: AuthRequest, rawId: string, body: RenameColumnDto) {
    const id = idField(rawId), projectId = await this.scope(req, await this.workspace.columnProject(id));
    const name = textField(body.name, 'Sütun adı', 60);
    if (!((await this.prisma.column.updateMany({ where: { id }, data: { name } })).count)) throw new NotFoundException('Sütun bulunamadı.');
    return this.workspace.board(projectId);
  }
  async remove(req: AuthRequest, rawId: string) {
    const id = idField(rawId), projectId = await this.scope(req, await this.workspace.columnProject(id));
    await this.workspace.transaction(async client => {
      // Serialize deletes so concurrent requests cannot remove the project's final column.
      await sql(client, 'LOCK TABLE columns IN EXCLUSIVE MODE');
      if ((await client.task.count({ where: { columnId: id }, }))) throw new BadRequestException('Önce bu sütundaki task’ları başka sütuna taşıyın.');
      if ((await client.column.count({ where: { projectId } })) <= 1) throw new BadRequestException('Panoda en az bir sütun olmalı.');
      if (!((await client.column.deleteMany({ where: { id }, })).count)) throw new NotFoundException('Sütun bulunamadı.');
    });
    return this.workspace.board(projectId);
  }
}
