import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type AuthRequest } from '../common/auth.ts';
import { DtoPipe } from '../common/dto.pipe.ts';
import { createPullRequestSchema, pullRequestStateSchema, updatePullRequestSchema, type CreatePullRequestDto, type PullRequestStateDto, type UpdatePullRequestDto } from './dto/pull-requests.dto.ts';
import { editPullRequestSchema, linkableTasksSchema, newPullRequestSchema, pullRequestsSchema, statePullRequestSchema } from './pull-requests.schemas.ts';
import { PullRequestsService } from './pull-requests.service.ts';

@ApiTags('Pull request’ler')
@ApiBearerAuth('bearer')
@ApiResponse({ status: 401, description: 'Oturum gerekli.' })
@ApiResponse({ status: 403, description: 'Yetki reddedildi.' })
@Controller('api/pull-requests')
export class PullRequestsController {
  constructor(@Inject(PullRequestsService) private service: PullRequestsService) { }
  @ApiOperation({ summary: 'Projenin PR’larını listele (pr.view yetkisi)' })
  @ApiQuery({ name: 'projectId', required: false, type: Number, description: 'Boş bırakılırsa erişilebilen tüm projelerin PR’ları döner.' })
  @ApiResponse({ status: 200, schema: pullRequestsSchema })
  @Get() async index(@Req() req: AuthRequest, @Query('projectId') projectId?: string) { return this.service.index(req, projectId); }
  @ApiOperation({ summary: 'Bir projenin task’larını listele — PR’a bağlamak için (pr.view yetkisi)' })
  @ApiQuery({ name: 'projectId', required: true, type: Number })
  @ApiResponse({ status: 200, schema: linkableTasksSchema })
  @Get('tasks') async linkable(@Req() req: AuthRequest, @Query('projectId') projectId: string) { return this.service.linkable(req, projectId); }
  @ApiOperation({ summary: 'PR ekle (pr.create yetkisi)' })
  @ApiBody({ schema: newPullRequestSchema })
  @ApiResponse({ status: 400, description: 'Geçersiz istek.' })
  @ApiResponse({ status: 201, schema: pullRequestsSchema })
  @Post() async create(@Req() req: AuthRequest, @Body(new DtoPipe(createPullRequestSchema)) body: CreatePullRequestDto, @Query('view') view?: string) { return this.service.create(req, body, view); }
  @ApiOperation({ summary: 'PR’ı düzenle (pr.update yetkisi)' })
  @ApiParam({ name: 'id', type: Number, example: 12 })
  @ApiBody({ schema: editPullRequestSchema })
  @ApiResponse({ status: 404, description: 'Kayıt bulunamadı.' })
  @ApiResponse({ status: 200, schema: pullRequestsSchema })
  @Patch(':id') async update(@Req() req: AuthRequest, @Param('id') id: string, @Body(new DtoPipe(updatePullRequestSchema)) body: UpdatePullRequestDto, @Query('view') view?: string) { return this.service.update(req, id, body, view); }
  @ApiOperation({ summary: 'PR durumunu değiştir — onaylandı/kapatıldı/bekliyor (pr.merge yetkisi)' })
  @ApiParam({ name: 'id', type: Number, example: 12 })
  @ApiBody({ schema: statePullRequestSchema })
  @ApiResponse({ status: 404, description: 'Kayıt bulunamadı.' })
  @ApiResponse({ status: 200, schema: pullRequestsSchema })
  @Patch(':id/state') async setState(@Req() req: AuthRequest, @Param('id') id: string, @Body(new DtoPipe(pullRequestStateSchema)) body: PullRequestStateDto, @Query('view') view?: string) { return this.service.setState(req, id, body, view); }
  @ApiOperation({ summary: 'PR’ı sil (pr.delete yetkisi)' })
  @ApiParam({ name: 'id', type: Number, example: 12 })
  @ApiResponse({ status: 404, description: 'Kayıt bulunamadı.' })
  @ApiResponse({ status: 200, schema: pullRequestsSchema })
  @Delete(':id') async remove(@Req() req: AuthRequest, @Param('id') id: string, @Query('view') view?: string) { return this.service.remove(req, id, view); }
}
