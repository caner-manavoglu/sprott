import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { allow, type AuthRequest } from '../common/auth.ts';
import { idField, textField } from '../common/fields.ts';
import type { Prisma } from '../generated/prisma/client.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { sql } from '../prisma/sql.ts';
import { WorkspaceService } from '../workspace/workspace.service.ts';
import { type SaveGroupDto } from './dto/groups.dto.ts';

@Injectable()
export class GroupsService {
  constructor(@Inject(WorkspaceService) private workspace: WorkspaceService, @Inject(PrismaService) private prisma: PrismaService) { }
  private async list() {
    return (await sql(this.prisma, `
      SELECT g.id, g.name,
        COALESCE((SELECT json_agg(json_build_object('id', u.id, 'name', u.name, 'surname', u.surname, 'title', u.title, 'hasAvatar', (u."avatarContent" IS NOT NULL)) ORDER BY u.name, u.surname)
          FROM group_members m JOIN users u ON u.id = m."userId" WHERE m."groupId" = g.id), '[]') AS members,
        COALESCE((SELECT json_agg(json_build_object('id', u.id, 'name', u.name, 'surname', u.surname, 'title', u.title, 'hasAvatar', (u."avatarContent" IS NOT NULL)) ORDER BY u.name, u.surname)
          FROM group_managers gm JOIN users u ON u.id = gm."userId" WHERE gm."groupId" = g.id), '[]') AS managers
      FROM groups g
      ORDER BY g.name
    `)).rows;
  }
  private async guard<T>(action: () => Promise<T>) {
    try { return await action(); } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new BadRequestException('Bu grup adı zaten kullanılıyor.');
      throw error;
    }
  }
  private async setPeople(client: Prisma.TransactionClient, table: 'group_members' | 'group_managers', groupId: number, value: unknown, label: string) {
    if (value === undefined) return;
    if (!Array.isArray(value)) throw new BadRequestException(`${label} listesi geçersiz.`);
    const ids = [...new Set(value.map(idField))];
    if (await client.user.count({ where: { id: { in: ids } } }) !== ids.length) throw new BadRequestException('Seçilen kullanıcılardan biri bulunamadı.');
    const data = ids.map(userId => ({ groupId, userId }));
    if (table === 'group_members') {
      await client.groupMember.deleteMany({ where: { groupId } });
      await client.groupMember.createMany({ data });
    } else {
      await client.groupManager.deleteMany({ where: { groupId } });
      await client.groupManager.createMany({ data });
    }
  }
  private async setMembers(client: Prisma.TransactionClient, groupId: number, body: Record<string, unknown>) {
    await this.setPeople(client, 'group_members', groupId, body.memberIds, 'Üye');
    await this.setPeople(client, 'group_managers', groupId, body.managerIds, 'Grup yöneticisi');
  }
  index(req: AuthRequest) { allow(req, 'group.view'); return this.list(); }
  async candidates(req: AuthRequest) {
    allow(req, 'group.view');
    return (await sql(this.prisma, 'SELECT id,name,surname,title,("avatarContent" IS NOT NULL) AS "hasAvatar" FROM users ORDER BY name,surname')).rows;
  }
  async create(req: AuthRequest, body: SaveGroupDto) {
    allow(req, 'group.create');
    const name = textField(body.name, 'Grup adı', 60);
    await this.guard(() => this.workspace.transaction(async client => {
      const groupId = (await client.group.create({ data: { name }, select: { id: true } })).id as number;
      await this.setMembers(client, groupId, body);
    }));
    return this.list();
  }
  async edit(req: AuthRequest, rawId: string, body: SaveGroupDto) {
    allow(req, 'group.update');
    const name = textField(body.name, 'Grup adı', 60), id = idField(rawId);
    await this.guard(() => this.workspace.transaction(async client => {
      if (!((await client.group.updateMany({ where: { id }, data: { name } })).count)) throw new NotFoundException('Grup bulunamadı.');
      await this.setMembers(client, id, body);
    }));
    return this.list();
  }
  async remove(req: AuthRequest, id: string) {
    allow(req, 'group.delete');
    // Üyelikler ON DELETE CASCADE ile birlikte silinir.
    if (!((await this.prisma.group.deleteMany({ where: { id: idField(id) }, })).count)) throw new NotFoundException('Grup bulunamadı.');
    return this.list();
  }
}
