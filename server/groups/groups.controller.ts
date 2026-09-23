import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type AuthRequest } from '../common/auth.ts';
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
  @Get() index(@Req() req: AuthRequest) { return this.service.index(req); }
  @ApiOperation({ summary: 'Gruba eklenebilecek kullanıcıları listele (group.view yetkisi)' })
  @ApiResponse({ status: 200, schema: membersSchema })
  @Get('members') async candidates(@Req() req: AuthRequest) { return this.service.candidates(req); }
  @ApiOperation({ summary: 'Grup oluştur (group.create yetkisi)' })
  @ApiBody({ schema: editGroupSchema })
  @ApiResponse({ status: 400, description: 'Geçersiz istek.' })
  @ApiResponse({ status: 201, schema: groupsSchema })
  @Post() async create(@Req() req: AuthRequest, @Body(new DtoPipe(saveGroupSchema)) body: SaveGroupDto) { return this.service.create(req, body); }
  @ApiOperation({ summary: 'Grubu güncelle (group.update yetkisi)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ schema: editGroupSchema })
  @ApiResponse({ status: 400, description: 'Geçersiz istek.' })
  @ApiResponse({ status: 404, description: 'Kayıt bulunamadı.' })
  @ApiResponse({ status: 200, schema: groupsSchema })
  @Patch(':id') async edit(@Req() req: AuthRequest, @Param('id') rawId: string, @Body(new DtoPipe(saveGroupSchema)) body: SaveGroupDto) { return this.service.edit(req, rawId, body); }
  @ApiOperation({ summary: 'Grubu sil (group.delete yetkisi)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiResponse({ status: 404, description: 'Kayıt bulunamadı.' })
  @ApiResponse({ status: 200, schema: groupsSchema })
  @Delete(':id') async remove(@Req() req: AuthRequest, @Param('id') id: string) { return this.service.remove(req, id); }
}
