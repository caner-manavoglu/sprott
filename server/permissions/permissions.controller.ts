import { Body, Controller, Get, Inject, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, ParseId } from '../common/auth.ts';
import type { User } from '../common/fields.ts';
import { DtoPipe } from '../common/dto.pipe.ts';
import { usersSchema } from '../common/schemas.ts';
import { updatePermissionsSchema, type UpdatePermissionsDto } from './dto/permissions.dto.ts';
import { definitionsSchema, permissionSchema } from './permissions.schemas.ts';
import { PermissionsService } from './permissions.service.ts';

@ApiTags('Yetkiler')
@ApiBearerAuth('bearer')
@ApiResponse({ status: 401, description: 'Oturum gerekli.' })
@ApiResponse({ status: 403, description: 'Yönetici yetkisi gerekli.' })
@Controller('api/permissions')
export class PermissionsController {
  constructor(@Inject(PermissionsService) private service: PermissionsService) { }
  @ApiOperation({ summary: 'Kullanıcı yetkilerini listele (yönetici)' })
  @ApiResponse({ status: 200, schema: usersSchema })
  @Get() async list(@CurrentUser() user: User) { return this.service.list(user); }
  @ApiOperation({ summary: 'Tanımlı yetki anahtarlarını listele (yönetici)' })
  @ApiResponse({ status: 200, schema: definitionsSchema })
  @Get('definitions') definitions(@CurrentUser() user: User) { return this.service.definitions(user); }
  @ApiOperation({ summary: 'Kişinin modül yetkilerini güncelle (yönetici)' })
  @ApiParam({ name: 'id', type: Number, example: 2 })
  @ApiBody({ schema: permissionSchema })
  @ApiResponse({ status: 400, description: 'Geçersiz istek.' })
  @ApiResponse({ status: 200, schema: usersSchema })
  @Patch(':id') async update(@CurrentUser() user: User, @Param('id', ParseId) id: number, @Body(new DtoPipe(updatePermissionsSchema)) body: UpdatePermissionsDto) { return this.service.update(user, id, body); }
}
