import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { admin, permissionLabels, type AuthRequest } from '../common/auth.ts';
import { idField, MANAGED_GROUPS, PERMISSIONS, type Permission } from '../common/fields.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { sql } from '../prisma/sql.ts';
import { WorkspaceService } from '../workspace/workspace.service.ts';
import { type UpdatePermissionsDto } from './dto/permissions.dto.ts';

@Injectable()
export class PermissionsService {
  constructor(@Inject(WorkspaceService) private workspace: WorkspaceService, @Inject(PrismaService) private prisma: PrismaService) { }
  async list(req: AuthRequest) {
    admin(req);
    // Yönettiği gruplar, grup raporu yetkisinin kime gösterileceğini belirler.
    return (await sql(this.prisma, `
      SELECT u.id,u.name,u.surname,u.title,u.email,u.role,u.permissions,(u."avatarContent" IS NOT NULL) AS "hasAvatar",
        ${MANAGED_GROUPS} AS "managedGroups"
      FROM users u ORDER BY u.id`)).rows;
  }
  definitions(req: AuthRequest) { admin(req); return PERMISSIONS.map(key => ({ key, label: permissionLabels[key] })); }
  async update(req: AuthRequest, id: string, body: UpdatePermissionsDto) {
    admin(req);
    const given = body.permissions;
    if (!given || typeof given !== 'object' || Array.isArray(given)) throw new BadRequestException('Yetki listesi geçersiz.');
    // Yalnızca açık yetkiler saklanır; tanımsız anahtar kabul edilmez.
    const permissions: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(given)) {
      if (!PERMISSIONS.includes(key as Permission)) throw new BadRequestException(`Tanımsız yetki: ${key}`);
      if (typeof value !== 'boolean') throw new BadRequestException('Yetki değeri geçersiz.');
      if (value) permissions[key] = true;
    }
    // Duyuru oluşturma yetkisi grup yöneticiliğinden türer; grup yönetmeyen kişiye verilemez.
    if (permissions['announcement.create']
      && !(await this.prisma.groupManager.count({ where: { userId: idField(id) }, }))) {
      throw new BadRequestException('Duyuru oluşturma yetkisi yalnızca grup yöneticilerine verilebilir.');
    }
    if (!((await this.prisma.user.updateMany({ where: { id: idField(id), role: "user" }, data: { permissions } })).count)) throw new BadRequestException('Yalnızca personel yetkisi değiştirilebilir.');
    return this.list(req);
  }
}
