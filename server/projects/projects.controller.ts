import { Body, Controller, Delete, Get, Inject, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { boardSchema } from '../board/board.schemas.ts';
import { CurrentUser, ParseId } from '../common/auth.ts';
import type { User } from '../common/fields.ts';
import { DtoPipe } from '../common/dto.pipe.ts';
import { usersSchema } from '../common/schemas.ts';
import { createProjectSchema, projectCompletionSchema, projectMemberSchema, updateProjectSchema, type CreateProjectDto, type ProjectCompletionDto, type ProjectMemberDto, type UpdateProjectDto } from './dto/projects.dto.ts';
import { completionSchema, editProjectSchema, memberSchema, newProjectSchema, projectsSchema } from './projects.schemas.ts';
import { ProjectsService } from './projects.service.ts';

@ApiTags('Projeler')
@ApiBearerAuth('bearer')
@ApiResponse({ status: 401, description: 'Oturum gerekli.' })
@ApiResponse({ status: 403, description: 'Yetki reddedildi.' })
@Controller('api/projects')
export class ProjectsController {
  constructor(@Inject(ProjectsService) private service: ProjectsService) { }
  @ApiOperation({ summary: 'Projeleri listele (project.view yetkisi; personel yalnızca üyesi olduklarını görür)' })
  @ApiResponse({ status: 200, schema: projectsSchema })
  @Get() async index(@CurrentUser() user: User) { return this.service.index(user); }
  @ApiOperation({ summary: 'Proje oluştur (project.create yetkisi)' })
  @ApiBody({ schema: newProjectSchema })
  @ApiResponse({ status: 400, description: 'Geçersiz istek.' })
  @ApiResponse({ status: 201, schema: projectsSchema })
  @Post() async create(@CurrentUser() user: User, @Body(new DtoPipe(createProjectSchema)) body: CreateProjectDto) { return this.service.create(user, body); }
  @ApiOperation({ summary: 'Projeyi güncelle (project.update yetkisi)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ schema: editProjectSchema })
  @ApiResponse({ status: 400, description: 'Geçersiz istek.' })
  @ApiResponse({ status: 404, description: 'Kayıt bulunamadı.' })
  @ApiResponse({ status: 200, schema: projectsSchema })
  @Patch(':id') async update(@CurrentUser() user: User, @Param('id', ParseId) id: number, @Body(new DtoPipe(updateProjectSchema)) body: UpdateProjectDto) { return this.service.update(user, id, body); }
  @ApiOperation({ summary: 'Projeyi tamamla veya yeniden aç (project.update yetkisi)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ schema: completionSchema })
  @ApiResponse({ status: 404, description: 'Kayıt bulunamadı.' })
  @ApiResponse({ status: 200, schema: projectsSchema })
  @Patch(':id/completion') async completion(@CurrentUser() user: User, @Param('id', ParseId) id: number, @Body(new DtoPipe(projectCompletionSchema)) body: ProjectCompletionDto) { return this.service.completion(user, id, body); }
  @ApiOperation({ summary: 'Projeyi sil (project.delete yetkisi; task’ları olan proje silinemez)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiResponse({ status: 400, description: 'Projede task var.' })
  @ApiResponse({ status: 404, description: 'Kayıt bulunamadı.' })
  @ApiResponse({ status: 200, schema: projectsSchema })
  @Delete(':id') async remove(@CurrentUser() user: User, @Param('id', ParseId) id: number) { return this.service.remove(user, id); }
  @ApiOperation({ summary: 'Proje üyelerini listele (project.view yetkisi)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiResponse({ status: 200, schema: usersSchema })
  @Get(':id/members') async members(@CurrentUser() user: User, @Param('id', ParseId) id: number) { return this.service.members(user, id); }
  @ApiOperation({ summary: 'Projeye üye ekle (project.update yetkisi)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ schema: memberSchema })
  @ApiResponse({ status: 404, description: 'Kayıt bulunamadı.' })
  @ApiResponse({ status: 201, schema: usersSchema })
  @Post(':id/members') async addMember(@CurrentUser() user: User, @Param('id', ParseId) id: number, @Body(new DtoPipe(projectMemberSchema)) body: ProjectMemberDto) { return this.service.addMember(user, id, body); }
  @ApiOperation({ summary: 'Projeden üye çıkar (project.update yetkisi)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiParam({ name: 'userId', type: Number, example: 2 })
  @ApiResponse({ status: 400, description: 'Üyeye atanmış task var.' })
  @ApiResponse({ status: 200, schema: usersSchema })
  @Delete(':id/members/:userId') async removeMember(@CurrentUser() user: User, @Param('id', ParseId) id: number, @Param('userId', ParseId) userId: number) { return this.service.removeMember(user, id, userId); }
  @ApiOperation({ summary: 'Projenin panosunu getir' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiResponse({ status: 404, description: 'Proje bulunamadı.' })
  @ApiResponse({ status: 200, schema: boardSchema })
  @Get(':id/board') async board(@CurrentUser() user: User, @Param('id', ParseId) id: number) { return this.service.board(user, id); }
}
