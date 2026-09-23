import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { allow } from '../common/auth.ts';
import { can, type User } from '../common/fields.ts';
import { dbDate } from '../prisma/dates.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { query } from '../prisma/sql.ts';
import { AccessService } from '../workspace/access.service.ts';
import { WorkspaceService } from '../workspace/workspace.service.ts';
import { type CreateProjectDto, type ProjectCompletionDto, type ProjectMemberDto, type UpdateProjectDto } from './dto/projects.dto.ts';

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(WorkspaceService) private workspace: WorkspaceService,
    @Inject(AccessService) private access: AccessService,
    @Inject(PrismaService) private prisma: PrismaService,
  ) { }
  private async list(user: User) {
    const ids = await this.access.projectIds(user);
    if (!ids.length) return [];
    return query(this.prisma, `
      SELECT p.id, p.name, p.description,
        to_char(p."startDate", 'YYYY-MM-DD') AS "startDate",
        to_char(p."endDate", 'YYYY-MM-DD') AS "endDate",
        to_char(p."completedAt", 'YYYY-MM-DD') AS "completedAt",
        (SELECT COUNT(*)::int FROM columns c WHERE c."projectId"=p.id) AS "columnCount",
        (SELECT COUNT(*)::int FROM tasks t JOIN columns c ON c.id=t."columnId" WHERE c."projectId"=p.id) AS "taskCount",
        (SELECT COUNT(*)::int FROM project_members m WHERE m."projectId"=p.id) AS "memberCount"
      FROM projects p WHERE p.id = ANY($1) ORDER BY p.id`, [ids]);
  }
  index(user: User) {
    allow(user, 'project.view');
    return this.list(user);
  }
  async create(user: User, body: CreateProjectDto) {
    allow(user, 'project.create');
    await this.prisma.project.create({
      data: {
        name: body.name, description: body.description ?? '', createdBy: user.id,
        startDate: dbDate(body.startDate ?? null), endDate: dbDate(body.endDate ?? null),
        members: { create: { userId: user.id } },
        columns: { create: ['Yapılacak', 'Devam ediyor', 'Tamamlandı'].map((name, index) => ({ name, position: index + 1 })) },
      },
    });
    return this.list(user);
  }
  async update(user: User, id: number, body: UpdateProjectDto) {
    allow(user, 'project.update');
    const projectId = await this.access.reachable(user, id);
    const data = {
      ...(body.name === undefined ? {} : { name: body.name }),
      ...(body.description === undefined ? {} : { description: body.description }),
      ...(body.startDate === undefined ? {} : { startDate: dbDate(body.startDate) }),
      ...(body.endDate === undefined ? {} : { endDate: dbDate(body.endDate) }),
    };
    if (!Object.keys(data).length) throw new BadRequestException('Güncellenecek alan gönderilmedi.');
    await this.prisma.project.update({ where: { id: projectId }, data });
    return this.list(user);
  }
  async completion(user: User, id: number, body: ProjectCompletionDto) {
    allow(user, 'project.update');
    const projectId = await this.access.reachable(user, id);
    // Tamamlanan projenin panosu dondurulur; kayıtların hiçbiri silinmez.
    await this.prisma.project.updateMany({ where: { id: projectId, ...(body.completed ? { completedAt: null } : {}) }, data: { completedAt: body.completed ? new Date() : null } });
    return this.list(user);
  }
  async remove(user: User, id: number) {
    allow(user, 'project.delete');
    const projectId = await this.access.reachable(user, id);
    await this.prisma.$transaction(async client => {
      if (await client.task.count({ where: { column: { projectId } } })) {
        throw new BadRequestException('Önce projedeki task’ları silin.');
      }
      await client.column.deleteMany({ where: { projectId } });
      if (!(await client.project.deleteMany({ where: { id: projectId } })).count) throw new NotFoundException('Proje bulunamadı.');
    });
    return this.list(user);
  }
  async members(user: User, id: number) {
    allow(user, 'project.view');
    return this.memberList(await this.access.reachable(user, id));
  }
  private memberList(projectId: number) {
    // Avatar içeriği okunmaz; yalnızca var olup olmadığı döner.
    return query(this.prisma,
      'SELECT u.id,u.name,u.surname,u.title,u.email,u.role,u.permissions,(u."avatarContent" IS NOT NULL) AS "hasAvatar" FROM users u JOIN project_members m ON m."userId"=u.id WHERE m."projectId"=$1 ORDER BY u.id',
      [projectId]);
  }
  async addMember(user: User, id: number, body: ProjectMemberDto) {
    allow(user, 'project.update');
    const projectId = await this.access.reachable(user, id);
    if (!(await this.prisma.user.count({ where: { id: body.userId } }))) throw new NotFoundException('Kullanıcı bulunamadı.');
    await this.prisma.projectMember.createMany({ data: [{ projectId, userId: body.userId }], skipDuplicates: true });
    return this.memberList(projectId);
  }
  async removeMember(user: User, id: number, userId: number) {
    allow(user, 'project.update');
    const projectId = await this.access.reachable(user, id);
    // Üyelikten çıkan kişinin açık task’ları sahipsiz kalmasın diye önce atamalar çözülmeli.
    if (await this.prisma.task.count({ where: { column: { projectId }, assigneeId: userId } })) {
      throw new BadRequestException('Bu üyeye atanmış task’lar var. Önce atamaları değiştirin.');
    }
    await this.prisma.projectMember.deleteMany({ where: { projectId, userId } });
    return this.memberList(projectId);
  }
  async board(user: User, id: number) {
    const board = await this.workspace.board(await this.access.reachable(user, id));
    // task.view olmayan kullanıcı sütunları görür, task’ları görmez.
    return can(user, 'task.view') ? board : { ...board, tasks: [] };
  }
}
