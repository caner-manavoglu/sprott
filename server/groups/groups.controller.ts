import { Body, Controller, Delete, Get, Inject, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, ParseId } from '../common/auth.ts';
import type { User } from '../common/fields.ts';
import { DtoPipe } from '../common/dto.pipe.ts';
import { saveGroupSchema, type SaveGroupDto } from './dto/groups.dto.ts';
import { editGroupSchema, groupsSchema, membersSchema } from './groups.schemas.ts';
import { GroupsService } from './groups.service.ts';

@ApiTags('Gruplar')
@ApiBearerAuth('bearer')
@ApiResponse({ status: 401, description: 'Oturum gerekli.' })
@ApiResponse({ status: 403, description: 'Yetki reddedildi.' })
@Controller('api/groups')
export class GroupsController {
  constructor(@Inject(GroupsService) private service: GroupsService) { }
  @ApiOperation({ summary: 'Grupları ve üyelerini listele (group.view yetkisi)' })
  @ApiResponse({ status: 200, schema: groupsSchema })
  @Get() index(@CurrentUser() user: User) { return this.service.index(user); }
  @ApiOperation({ summary: 'Gruba eklenebilecek kullanıcıları listele (group.view yetkisi)' })
  @ApiResponse({ status: 200, schema: membersSchema })
  @Get('members') async candidates(@CurrentUser() user: User) { return this.service.candidates(user); }
  @ApiOperation({ summary: 'Grup oluştur (group.create yetkisi)' })
  @ApiBody({ schema: editGroupSchema })
  @ApiResponse({ status: 400, description: 'Geçersiz istek.' })
  @ApiResponse({ status: 201, schema: groupsSchema })
  @Post() async create(@CurrentUser() user: User, @Body(new DtoPipe(saveGroupSchema)) body: SaveGroupDto) { return this.service.create(user, body); }
  @ApiOperation({ summary: 'Grubu güncelle (group.update yetkisi)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ schema: editGroupSchema })
  @ApiResponse({ status: 400, description: 'Geçersiz istek.' })
  @ApiResponse({ status: 404, description: 'Kayıt bulunamadı.' })
  @ApiResponse({ status: 200, schema: groupsSchema })
  @Patch(':id') async edit(@CurrentUser() user: User, @Param('id', ParseId) id: number, @Body(new DtoPipe(saveGroupSchema)) body: SaveGroupDto) { return this.service.edit(user, id, body); }
  @ApiOperation({ summary: 'Grubu sil (group.delete yetkisi)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiResponse({ status: 404, description: 'Kayıt bulunamadı.' })
  @ApiResponse({ status: 200, schema: groupsSchema })
  @Delete(':id') async remove(@CurrentUser() user: User, @Param('id', ParseId) id: number) { return this.service.remove(user, id); }
}
