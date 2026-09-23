import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { can, type User } from '../common/fields.ts';
import { PrismaService } from '../prisma/prisma.service.ts';

/** Kim hangi projeye ve hangi kişinin kaydına erişebilir; bütün modüller aynı kapsamı kullanır. */
@Injectable()
export class AccessService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) { }
  /** Yöneticiler her projeye erişir; personel yalnızca üyesi olduğu projelere. */
  async reachable(user: User, projectId: number) {
    if (!(await this.prisma.project.count({ where: { id: projectId } }))) throw new NotFoundException('Proje bulunamadı.');
    if (user.role !== 'admin' && !(await this.prisma.projectMember.count({ where: { projectId, userId: user.id } }))) {
      throw new ForbiddenException('Bu projenin üyesi değilsiniz.');
    }
    return projectId;
  }
  /**
   * Panoya yazma izni: projeye erişim + projenin tamamlanmamış olması.
   * Tamamlanan projede sütunlar ve task'lar dondurulur; kayıtlar olduğu gibi kalır.
   * Projenin kendisi (ad, açıklama, tarihler, üyeler) düzenlenebilir ve yeniden açılabilir.
   */
  async writable(user: User, projectId: number) {
    await this.reachable(user, projectId);
    if (await this.prisma.project.count({ where: { id: projectId, completedAt: { not: null } } })) {
      throw new ForbiddenException('Proje tamamlandı. Değişiklik için projeyi yeniden açın.');
    }
    return projectId;
  }
  async projectIds(user: User): Promise<number[]> {
    const rows = await this.prisma.project.findMany({
      where: user.role === 'admin' ? {} : { members: { some: { userId: user.id } } },
      select: { id: true }, orderBy: { id: 'asc' },
    });
    return rows.map(row => row.id);
  }
  /**
   * Kimlerin kaydını görebilir: tüm personel > yönettiği grupların üyeleri > yalnızca kendisi.
   * `userIds` null ise sınır yoktur. Raporlar ve süresi geçen task listesi aynı kapsamı kullanır.
   */
  async visibleUsers(user: User) {
    const managed = can(user, 'report.view.group')
      ? (await this.prisma.groupManager.findMany({ where: { userId: user.id }, select: { group: { select: { id: true, name: true } } }, orderBy: { group: { name: 'asc' } } })).map(row => row.group)
      : [];
    const scope = can(user, 'report.view.all') ? 'all' : managed.length ? 'group' : 'self';
    const userIds = scope === 'all' ? null
      : scope === 'self' ? [user.id]
        : [...new Set([user.id, ...(await this.prisma.groupMember.findMany({ where: { groupId: { in: managed.map(group => group.id) } }, select: { userId: true } })).map(row => row.userId)])];
    return { scope, groups: managed.map(group => group.name), userIds };
  }
  /** Sütunun bağlı olduğu proje; sütun yoksa 404. */
  async columnProject(columnId: number): Promise<number> {
    const row = await this.prisma.column.findUnique({ where: { id: columnId }, select: { projectId: true } });
    if (!row) throw new NotFoundException('Sütun bulunamadı.');
    return row.projectId;
  }
  /** Task'ın bağlı olduğu proje; task yoksa 404. */
  async taskProject(taskId: number): Promise<number> {
    const row = await this.prisma.task.findUnique({ where: { id: taskId }, select: { column: { select: { projectId: true } } } });
    if (!row) throw new NotFoundException('Task bulunamadı.');
    return row.column.projectId;
  }
}
