import { BadRequestException, Body, Controller, Delete, Get, Inject, NotFoundException, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { PoolClient } from 'pg';
import { Store, idField, textField } from '../store.ts';
import { type AuthRequest, allow } from '../common/auth.ts';
import { editGroupSchema, groupsSchema, membersSchema } from './groups.schemas.ts';

@ApiTags('Gruplar')
@ApiBearerAuth('bearer')
@ApiResponse({status: 401, description: 'Oturum gerekli.'})
@ApiResponse({status: 403, description: 'Yetki reddedildi.'})
@Controller('api/groups')
export class GroupsController {
  constructor(@Inject(Store) private store: Store) {}
  private async list() {
    return (await this.store.db.query(`
      SELECT g.id, g.name,
        COALESCE((SELECT json_agg(json_build_object('id', u.id, 'name', u.name, 'surname', u.surname, 'title', u.title) ORDER BY u.name, u.surname)
          FROM group_members m JOIN users u ON u.id = m."userId" WHERE m."groupId" = g.id), '[]') AS members,
        COALESCE((SELECT json_agg(json_build_object('id', u.id, 'name', u.name, 'surname', u.surname, 'title', u.title) ORDER BY u.name, u.surname)
          FROM group_managers gm JOIN users u ON u.id = gm."userId" WHERE gm."groupId" = g.id), '[]') AS managers
      FROM groups g
      ORDER BY g.name
    `)).rows;
  }
  // Aynı ad ikinci kez kaydedilemez; benzersizlik kısıtı hatası kullanıcıya açık mesaja çevrilir.
  private async guard<T>(action: () => Promise<T>) {
    try { return await action(); } catch (error) {
      if ((error as {code?: string}).code === '23505') throw new BadRequestException('Bu grup adı zaten kullanılıyor.');
      throw error;
    }
  }
  /** Üyelik ve yöneticilik listeleri tamamen gönderilen kimliklerle değiştirilir; boş liste hepsini kaldırır. */
  private async setPeople(client: PoolClient, table: 'group_members'|'group_managers', groupId: number, value: unknown, label: string) {
    if (value === undefined) return;
    if (!Array.isArray(value)) throw new BadRequestException(`${label} listesi geçersiz.`);
    const ids = [...new Set(value.map(idField))];
    await client.query(`DELETE FROM ${table} WHERE "groupId"=$1`, [groupId]);
    if (!ids.length) return;
    const inserted = await client.query(`INSERT INTO ${table}("groupId","userId") SELECT $1, id FROM users WHERE id = ANY($2::int[])`, [groupId, ids]);
    if (inserted.rowCount !== ids.length) throw new BadRequestException('Seçilen kullanıcılardan biri bulunamadı.');
  }
  private async setMembers(client: PoolClient, groupId: number, body: Record<string, unknown>) {
    await this.setPeople(client, 'group_members', groupId, body.memberIds, 'Üye');
    await this.setPeople(client, 'group_managers', groupId, body.managerIds, 'Grup yöneticisi');
  }
  @ApiOperation({summary: 'Grupları ve üyelerini listele (group.view yetkisi)'})
  @ApiResponse({status: 200, schema: groupsSchema})
  @Get() index(@Req() req: AuthRequest) { allow(req, 'group.view'); return this.list(); }
  // ':id' rotasından önce tanımlı olmalı, yoksa 'members' bir kimlik sanılır.
  @ApiOperation({summary: 'Gruba eklenebilecek kullanıcıları listele (group.view yetkisi)'})
  @ApiResponse({status: 200, schema: membersSchema})
  @Get('members') async candidates(@Req() req: AuthRequest) {
    allow(req, 'group.view');
    return (await this.store.db.query('SELECT id,name,surname,title FROM users ORDER BY name,surname')).rows;
  }
  @ApiOperation({summary: 'Grup oluştur (group.create yetkisi)'})
  @ApiBody({schema: editGroupSchema})
  @ApiResponse({status: 400, description: 'Geçersiz istek.'})
  @ApiResponse({status: 201, schema: groupsSchema})
  @Post() async create(@Req() req: AuthRequest, @Body() body: Record<string, unknown>) {
    allow(req, 'group.create');
    const name = textField(body.name, 'Grup adı', 60);
    await this.guard(() => this.store.transaction(async client => {
      const groupId = (await client.query('INSERT INTO groups(name) VALUES($1) RETURNING id', [name])).rows[0].id as number;
      await this.setMembers(client, groupId, body);
    }));
    return this.list();
  }
  @ApiOperation({summary: 'Grubu güncelle (group.update yetkisi)'})
  @ApiParam({name: 'id', type: Number, example: 1})
  @ApiBody({schema: editGroupSchema})
  @ApiResponse({status: 400, description: 'Geçersiz istek.'})
  @ApiResponse({status: 404, description: 'Kayıt bulunamadı.'})
  @ApiResponse({status: 200, schema: groupsSchema})
  @Patch(':id') async edit(@Req() req: AuthRequest, @Param('id') rawId: string, @Body() body: Record<string, unknown>) {
    allow(req, 'group.update');
    const name = textField(body.name, 'Grup adı', 60), id = idField(rawId);
    await this.guard(() => this.store.transaction(async client => {
      if (!(await client.query('UPDATE groups SET name=$1 WHERE id=$2', [name, id])).rowCount) throw new NotFoundException('Grup bulunamadı.');
      await this.setMembers(client, id, body);
    }));
    return this.list();
  }
  @ApiOperation({summary: 'Grubu sil (group.delete yetkisi)'})
  @ApiParam({name: 'id', type: Number, example: 1})
  @ApiResponse({status: 404, description: 'Kayıt bulunamadı.'})
  @ApiResponse({status: 200, schema: groupsSchema})
  @Delete(':id') async remove(@Req() req: AuthRequest, @Param('id') id: string) {
    allow(req, 'group.delete');
    // Üyelikler ON DELETE CASCADE ile birlikte silinir.
    if (!(await this.store.db.query('DELETE FROM groups WHERE id=$1', [idField(id)])).rowCount) throw new NotFoundException('Grup bulunamadı.');
    return this.list();
  }
}
