import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { allow } from '../common/auth.ts';
import type { User } from '../common/fields.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { execute } from '../prisma/sql.ts';
import { AccessService } from '../workspace/access.service.ts';
import { WorkspaceService } from '../workspace/workspace.service.ts';
import { type CreateColumnDto, type OrderColumnsDto, type RenameColumnDto } from './dto/columns.dto.ts';

@Injectable()
export class ColumnsService {
  constructor(
    @Inject(WorkspaceService) private workspace: WorkspaceService,
    @Inject(AccessService) private access: AccessService,
    @Inject(PrismaService) private prisma: PrismaService,
  ) { }
  private scope(user: User, projectId: number) {
    return this.access.writable(allow(user, 'project.update'), projectId);
  }
  async add(user: User, body: CreateColumnDto) {
    const projectId = await this.scope(user, body.projectId);
    await this.prisma.$transaction(async client => {
      await execute(client, 'LOCK TABLE columns IN EXCLUSIVE MODE');
      const last = await client.column.aggregate({ where: { projectId }, _max: { position: true } });
      await client.column.create({ data: { name: body.name, projectId, position: (last._max.position ?? 0) + 1 } });
    });
    return this.workspace.board(projectId);
  }
  async reorder(user: User, body: OrderColumnsDto) {
    const ids = body.columnIds;
    const projectId = await this.scope(user, await this.access.columnProject(ids[0]));
    await this.prisma.$transaction(async client => {
      await execute(client, 'LOCK TABLE columns IN EXCLUSIVE MODE');
      const existing = (await client.column.findMany({ where: { projectId }, select: { id: true } })).map(row => row.id);
      if (ids.length !== existing.length || new Set(ids).size !== ids.length || ids.some(id => !existing.includes(id))) throw new BadRequestException('Projenin her sütununu tam bir kez gönderin. Panoyu yenileyip tekrar deneyin.');
      for (const [index, id] of ids.entries()) await client.column.update({ where: { id }, data: { position: index + 1 } });
    });
    return this.workspace.board(projectId);
  }
  async rename(user: User, id: number, body: RenameColumnDto) {
    const projectId = await this.scope(user, await this.access.columnProject(id));
    if (!(await this.prisma.column.updateMany({ where: { id }, data: { name: body.name } })).count) throw new NotFoundException('Sütun bulunamadı.');
    return this.workspace.board(projectId);
  }
  async remove(user: User, id: number) {
    const projectId = await this.scope(user, await this.access.columnProject(id));
    await this.prisma.$transaction(async client => {
      // Serialize deletes so concurrent requests cannot remove the project's final column.
      await execute(client, 'LOCK TABLE columns IN EXCLUSIVE MODE');
      if (await client.task.count({ where: { columnId: id } })) throw new BadRequestException('Önce bu sütundaki task’ları başka sütuna taşıyın.');
      if ((await client.column.count({ where: { projectId } })) <= 1) throw new BadRequestException('Panoda en az bir sütun olmalı.');
      if (!(await client.column.deleteMany({ where: { id } })).count) throw new NotFoundException('Sütun bulunamadı.');
    });
    return this.workspace.board(projectId);
  }
}
