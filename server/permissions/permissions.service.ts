import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { admin, permissionLabels } from '../common/auth.ts';
import { MANAGED_GROUPS, PERMISSIONS, type User } from '../common/fields.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { query } from '../prisma/sql.ts';
import { type UpdatePermissionsDto } from './dto/permissions.dto.ts';

@Injectable()
export class PermissionsService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) { }
  list(user: User) {
    admin(user);
    // Yönettiği gruplar, grup raporu yetkisinin kime gösterileceğini belirler.
    return query(this.prisma, `
      SELECT u.id,u.name,u.surname,u.title,u.email,u.role,u.permissions,(u."avatarContent" IS NOT NULL) AS "hasAvatar",
        ${MANAGED_GROUPS} AS "managedGroups"
      FROM users u ORDER BY u.id`);
  }
  definitions(user: User) { admin(user); return PERMISSIONS.map(key => ({ key, label: permissionLabels[key] })); }
  async update(user: User, id: number, body: UpdatePermissionsDto) {
    admin(user);
    // Yalnızca açık yetkiler saklanır; tanımsız anahtarı DTO reddeder.
    const permissions = Object.fromEntries(Object.entries(body.permissions).filter(([, granted]) => granted));
    // Duyuru oluşturma yetkisi grup yöneticiliğinden türer; grup yönetmeyen kişiye verilemez.
    if (permissions['announcement.create'] && !(await this.prisma.groupManager.count({ where: { userId: id } }))) {
      throw new BadRequestException('Duyuru oluşturma yetkisi yalnızca grup yöneticilerine verilebilir.');
    }
    if (!(await this.prisma.user.updateMany({ where: { id, role: 'user' }, data: { permissions } })).count) throw new BadRequestException('Yalnızca personel yetkisi değiştirilebilir.');
    return this.list(user);
  }
}
