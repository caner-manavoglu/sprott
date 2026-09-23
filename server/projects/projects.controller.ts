import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { boardSchema } from '../board/board.schemas.ts';
import { type AuthRequest } from '../common/auth.ts';
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
  @Get() async index(@Req() req: AuthRequest) { return this.service.index(req); }
  @ApiOperation({ summary: 'Proje oluştur (project.create yetkisi)' })
  @ApiBody({ schema: newProjectSchema })
  @ApiResponse({ status: 400, description: 'Geçersiz istek.' })
  @ApiResponse({ status: 201, schema: projectsSchema })
  @Post() async create(@Req() req: AuthRequest, @Body(new DtoPipe(createProjectSchema)) body: CreateProjectDto) { return this.service.create(req, body); }
  @ApiOperation({ summary: 'Projeyi güncelle (project.update yetkisi)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ schema: editProjectSchema })
  @ApiResponse({ status: 400, description: 'Geçersiz istek.' })
  @ApiResponse({ status: 404, description: 'Kayıt bulunamadı.' })
  @ApiResponse({ status: 200, schema: projectsSchema })
  @Patch(':id') async update(@Req() req: AuthRequest, @Param('id') id: string, @Body(new DtoPipe(updateProjectSchema)) body: UpdateProjectDto) { return this.service.update(req, id, body); }
  @ApiOperation({ summary: 'Projeyi tamamla veya yeniden aç (project.update yetkisi)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ schema: completionSchema })
  @ApiResponse({ status: 404, description: 'Kayıt bulunamadı.' })
  @ApiResponse({ status: 200, schema: projectsSchema })
  @Patch(':id/completion') async completion(@Req() req: AuthRequest, @Param('id') id: string, @Body(new DtoPipe(projectCompletionSchema)) body: ProjectCompletionDto) { return this.service.completion(req, id, body); }
  @ApiOperation({ summary: 'Projeyi sil (project.delete yetkisi; task’ları olan proje silinemez)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiResponse({ status: 400, description: 'Projede task var.' })
  @ApiResponse({ status: 404, description: 'Kayıt bulunamadı.' })
  @ApiResponse({ status: 200, schema: projectsSchema })
  @Delete(':id') async remove(@Req() req: AuthRequest, @Param('id') id: string) { return this.service.remove(req, id); }
  @ApiOperation({ summary: 'Proje üyelerini listele (project.view yetkisi)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiResponse({ status: 200, schema: usersSchema })
  @Get(':id/members') async members(@Req() req: AuthRequest, @Param('id') id: string) { return this.service.members(req, id); }
  @ApiOperation({ summary: 'Projeye üye ekle (project.update yetkisi)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ schema: memberSchema })
  @ApiResponse({ status: 404, description: 'Kayıt bulunamadı.' })
  @ApiResponse({ status: 201, schema: usersSchema })
  @Post(':id/members') async addMember(@Req() req: AuthRequest, @Param('id') id: string, @Body(new DtoPipe(projectMemberSchema)) body: ProjectMemberDto) { return this.service.addMember(req, id, body); }
  @ApiOperation({ summary: 'Projeden üye çıkar (project.update yetkisi)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiParam({ name: 'userId', type: Number, example: 2 })
  @ApiResponse({ status: 400, description: 'Üyeye atanmış task var.' })
  @ApiResponse({ status: 200, schema: usersSchema })
  @Delete(':id/members/:userId') async removeMember(@Req() req: AuthRequest, @Param('id') id: string, @Param('userId') rawUserId: string) { return this.service.removeMember(req, id, rawUserId); }
  @ApiOperation({ summary: 'Projenin panosunu getir' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiResponse({ status: 404, description: 'Proje bulunamadı.' })
  @ApiResponse({ status: 200, schema: boardSchema })
  @Get(':id/board') async board(@Req() req: AuthRequest, @Param('id') id: string) { return this.service.board(req, id); }
}
