import { BadRequestException, Body, Controller, Get, Inject, Param, Patch, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { idField, MANAGED_GROUPS, PERMISSIONS, Store, type Permission } from '../store.ts';
import { type AuthRequest, admin, permissionLabels } from '../common/auth.ts';
import { usersSchema } from '../common/schemas.ts';
import { definitionsSchema, permissionSchema } from './permissions.schemas.ts';

@ApiTags('Yetkiler')
@ApiBearerAuth('bearer')
@ApiResponse({status: 401, description: 'Oturum gerekli.'})
@ApiResponse({status: 403, description: 'Yönetici yetkisi gerekli.'})
@Controller('api/permissions')
export class PermissionsController {
  constructor(@Inject(Store) private store: Store) {}
  @ApiOperation({summary: 'Kullanıcı yetkilerini listele (yönetici)'})
  @ApiResponse({status: 200, schema: usersSchema})
  @Get() async list(@Req() req: AuthRequest) {
    admin(req);
    // Yönettiği gruplar, grup raporu yetkisinin kime gösterileceğini belirler.
    return (await this.store.db.query(`
      SELECT u.id,u.name,u.surname,u.title,u.email,u.role,u.permissions,
        ${MANAGED_GROUPS} AS "managedGroups"
      FROM users u ORDER BY u.id`)).rows;
  }
  @ApiOperation({summary: 'Tanımlı yetki anahtarlarını listele (yönetici)'})
  @ApiResponse({status: 200, schema: definitionsSchema})
  @Get('definitions') definitions(@Req() req: AuthRequest) { admin(req); return PERMISSIONS.map(key => ({key, label: permissionLabels[key]})); }
  @ApiOperation({summary: 'Kişinin modül yetkilerini güncelle (yönetici)'})
  @ApiParam({name: 'id', type: Number, example: 2})
  @ApiBody({schema: permissionSchema})
  @ApiResponse({status: 400, description: 'Geçersiz istek.'})
  @ApiResponse({status: 200, schema: usersSchema})
  @Patch(':id') async update(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) {
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
      && !(await this.store.db.query('SELECT 1 FROM group_managers WHERE "userId"=$1 LIMIT 1', [idField(id)])).rowCount) {
      throw new BadRequestException('Duyuru oluşturma yetkisi yalnızca grup yöneticilerine verilebilir.');
    }
    if (!(await this.store.db.query(`UPDATE users SET permissions=$1 WHERE id=$2 AND role='user'`, [permissions, idField(id)])).rowCount) throw new BadRequestException('Yalnızca personel yetkisi değiştirilebilir.');
    return this.list(req);
  }
}
