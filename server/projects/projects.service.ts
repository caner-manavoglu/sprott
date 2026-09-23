import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { allow, current, type AuthRequest } from '../common/auth.ts';
import { dateField, idField, textField } from '../common/fields.ts';
import { dbDate } from '../prisma/dates.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { sql } from '../prisma/sql.ts';
import { WorkspaceService } from '../workspace/workspace.service.ts';
import { type CreateProjectDto, type ProjectCompletionDto, type ProjectMemberDto, type UpdateProjectDto } from './dto/projects.dto.ts';

@Injectable()
export class ProjectsService {
  constructor(@Inject(WorkspaceService) private workspace: WorkspaceService, @Inject(PrismaService) private prisma: PrismaService) { }
  private async list(ids: number[]) {
    if (!ids.length) return [];
    return (await sql(this.prisma, `
      SELECT p.id, p.name, p.description,
        to_char(p."startDate", 'YYYY-MM-DD') AS "startDate",
        to_char(p."endDate", 'YYYY-MM-DD') AS "endDate",
        to_char(p."completedAt", 'YYYY-MM-DD') AS "completedAt",
        (SELECT COUNT(*)::int FROM columns c WHERE c."projectId"=p.id) AS "columnCount",
        (SELECT COUNT(*)::int FROM tasks t JOIN columns c ON c.id=t."columnId" WHERE c."projectId"=p.id) AS "taskCount",
        (SELECT COUNT(*)::int FROM project_members m WHERE m."projectId"=p.id) AS "memberCount"
      FROM projects p WHERE p.id = ANY($1) ORDER BY p.id`, [ids])).rows;
  }
  private fields(body: Record<string, unknown>, required: boolean) {
    const values: Record<string, string | null> = {};
    if (required || body.name !== undefined) values.name = textField(body.name, 'Proje adı', 80);
    if (body.description !== undefined) values.description = typeof body.description === 'string' && body.description.trim().length <= 2000
      ? body.description.trim() : (() => { throw new BadRequestException('Açıklama en fazla 2000 karakter olmalı.'); })();
    if (body.startDate !== undefined) values.startDate = dateField(body.startDate, 'Başlangıç tarihi');
    if (body.endDate !== undefined) values.endDate = dateField(body.endDate, 'Bitiş tarihi');
    return values;
  }
  async index(req: AuthRequest) {
    const user = allow(req, 'project.view');
    return this.list(await this.workspace.projectIds(user));
  }
  async create(req: AuthRequest, body: CreateProjectDto) {
    const user = allow(req, 'project.create');
    const { name, description = '', startDate = null, endDate = null } = this.fields(body, true);
    await this.prisma.project.create({
      data: {
        name: name!, description: description ?? '', createdBy: user.id, startDate: dbDate(startDate), endDate: dbDate(endDate),
        members: { create: { userId: user.id } },
        columns: { create: ['Yapılacak', 'Devam ediyor', 'Tamamlandı'].map((name, index) => ({ name, position: index + 1 })) },
      }
    });
    return this.list(await this.workspace.projectIds(user));
  }
  async update(req: AuthRequest, id: string, body: UpdateProjectDto) {
    const user = allow(req, 'project.update');
    const projectId = await this.workspace.reachable(user, idField(id));
    const fields = this.fields(body, false), keys = Object.keys(fields);
    if (!keys.length) throw new BadRequestException('Güncellenecek alan gönderilmedi.');
    await this.prisma.project.update({
      where: { id: projectId }, data: {
        ...(fields.name === undefined ? {} : { name: fields.name! }),
        ...(fields.description === undefined ? {} : { description: fields.description! }),
        ...(fields.startDate === undefined ? {} : { startDate: dbDate(fields.startDate) }),
        ...(fields.endDate === undefined ? {} : { endDate: dbDate(fields.endDate) }),
      }
    });
    return this.list(await this.workspace.projectIds(user));
  }
  async completion(req: AuthRequest, id: string, body: ProjectCompletionDto) {
    const user = allow(req, 'project.update');
    const projectId = await this.workspace.reachable(user, idField(id));
    if (typeof body.completed !== 'boolean') throw new BadRequestException('completed alanı true veya false olmalı.');
    // Tamamlanan projenin panosu dondurulur; kayıtların hiçbiri silinmez.
    await this.prisma.project.updateMany({ where: { id: projectId, ...(body.completed ? { completedAt: null } : {}) }, data: { completedAt: body.completed ? new Date() : null } });
    return this.list(await this.workspace.projectIds(user));
  }
  async remove(req: AuthRequest, id: string) {
    const user = allow(req, 'project.delete');
    const projectId = await this.workspace.reachable(user, idField(id));
    await this.workspace.transaction(async client => {
      if (await client.task.count({ where: { column: { projectId } } })) {
        throw new BadRequestException('Önce projedeki task’ları silin.');
      }
      await client.column.deleteMany({ where: { projectId }, });
      if (!((await client.project.deleteMany({ where: { id: projectId }, })).count)) throw new NotFoundException('Proje bulunamadı.');
    });
    return this.list(await this.workspace.projectIds(user));
  }
  async members(req: AuthRequest, id: string) {
    const user = allow(req, 'project.view');
    const projectId = await this.workspace.reachable(user, idField(id));
    return this.memberList(projectId);
  }
  private async memberList(projectId: number) {
    return (await sql(this.prisma,
      'SELECT u.id,u.name,u.surname,u.title,u.email,u.role,u.permissions,(u."avatarContent" IS NOT NULL) AS "hasAvatar" FROM users u JOIN project_members m ON m."userId"=u.id WHERE m."projectId"=$1 ORDER BY u.id',
      [projectId])).rows;
  }
  async addMember(req: AuthRequest, id: string, body: ProjectMemberDto) {
    const user = allow(req, 'project.update');
    const projectId = await this.workspace.reachable(user, idField(id)), userId = idField(body.userId);
    if (!(await this.prisma.user.count({ where: { id: userId }, }))) throw new NotFoundException('Kullanıcı bulunamadı.');
    await this.prisma.projectMember.createMany({ data: [{ projectId, userId }], skipDuplicates: true });
    return this.memberList(projectId);
  }
  async removeMember(req: AuthRequest, id: string, rawUserId: string) {
    const user = allow(req, 'project.update');
    const projectId = await this.workspace.reachable(user, idField(id)), userId = idField(rawUserId);
    // Üyelikten çıkan kişinin açık task’ları sahipsiz kalmasın diye önce atamalar çözülmeli.
    if (await this.prisma.task.count({ where: { column: { projectId }, assigneeId: userId } })) {
      throw new BadRequestException('Bu üyeye atanmış task’lar var. Önce atamaları değiştirin.');
    }
    await this.prisma.projectMember.deleteMany({ where: { projectId, userId }, });
    return this.memberList(projectId);
  }
  async board(req: AuthRequest, id: string) {
    const user = current(req);
    const projectId = await this.workspace.reachable(user, idField(id));
    const board = await this.workspace.board(projectId);
    // task.view olmayan kullanıcı sütunları görür, task’ları görmez.
    return user.role === 'admin' || user.permissions?.['task.view'] === true ? board : { ...board, tasks: [] };
  }
}
