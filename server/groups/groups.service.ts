import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { allow } from '../common/auth.ts';
import type { User } from '../common/fields.ts';
import type { Prisma } from '../generated/prisma/client.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { query } from '../prisma/sql.ts';
import { type SaveGroupDto } from './dto/groups.dto.ts';

@Injectable()
export class GroupsService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) { }
  private list() {
    return query(this.prisma, `
      SELECT g.id, g.name,
        COALESCE((SELECT json_agg(json_build_object('id', u.id, 'name', u.name, 'surname', u.surname, 'title', u.title, 'hasAvatar', (u."avatarContent" IS NOT NULL)) ORDER BY u.name, u.surname)
          FROM group_members m JOIN users u ON u.id = m."userId" WHERE m."groupId" = g.id), '[]') AS members,
        COALESCE((SELECT json_agg(json_build_object('id', u.id, 'name', u.name, 'surname', u.surname, 'title', u.title, 'hasAvatar', (u."avatarContent" IS NOT NULL)) ORDER BY u.name, u.surname)
          FROM group_managers gm JOIN users u ON u.id = gm."userId" WHERE gm."groupId" = g.id), '[]') AS managers
      FROM groups g
      ORDER BY g.name`);
  }
  private async guard<T>(action: () => Promise<T>) {
    try { return await action(); } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new BadRequestException('Bu grup adı zaten kullanılıyor.');
      throw error;
    }
  }
  /** Gönderilen listeler üyeleri/yöneticileri tamamen değiştirir; gönderilmeyen liste olduğu gibi kalır. */
  private async setPeople(client: Prisma.TransactionClient, groupId: number, body: SaveGroupDto) {
    const ids = [...new Set([...body.memberIds ?? [], ...body.managerIds ?? []])];
    if (await client.user.count({ where: { id: { in: ids } } }) !== ids.length) throw new BadRequestException('Seçilen kullanıcılardan biri bulunamadı.');
    if (body.memberIds) {
      await client.groupMember.deleteMany({ where: { groupId } });
      await client.groupMember.createMany({ data: body.memberIds.map(userId => ({ groupId, userId })) });
    }
    if (body.managerIds) {
      await client.groupManager.deleteMany({ where: { groupId } });
      await client.groupManager.createMany({ data: body.managerIds.map(userId => ({ groupId, userId })) });
    }
  }
  index(user: User) { allow(user, 'group.view'); return this.list(); }
  async candidates(user: User) {
    allow(user, 'group.view');
    return query(this.prisma, 'SELECT id,name,surname,title,("avatarContent" IS NOT NULL) AS "hasAvatar" FROM users ORDER BY name,surname');
  }
  async create(user: User, body: SaveGroupDto) {
    allow(user, 'group.create');
    await this.guard(() => this.prisma.$transaction(async client => {
      const { id } = await client.group.create({ data: { name: body.name }, select: { id: true } });
      await this.setPeople(client, id, body);
    }));
    return this.list();
  }
  async edit(user: User, id: number, body: SaveGroupDto) {
    allow(user, 'group.update');
    await this.guard(() => this.prisma.$transaction(async client => {
      if (!(await client.group.updateMany({ where: { id }, data: { name: body.name } })).count) throw new NotFoundException('Grup bulunamadı.');
      await this.setPeople(client, id, body);
    }));
    return this.list();
  }
  async remove(user: User, id: number) {
    allow(user, 'group.delete');
    // Üyelikler ON DELETE CASCADE ile birlikte silinir.
    if (!(await this.prisma.group.deleteMany({ where: { id } })).count) throw new NotFoundException('Grup bulunamadı.');
    return this.list();
  }
}
