import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, ParseId } from '../common/auth.ts';
import type { User } from '../common/fields.ts';
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
  @Get() async index(@CurrentUser() user: User, @Query('projectId') projectId?: string) { return this.service.index(user, projectId); }
  @ApiOperation({ summary: 'Bir projenin task’larını listele — PR’a bağlamak için (pr.view yetkisi)' })
  @ApiQuery({ name: 'projectId', required: true, type: Number })
  @ApiResponse({ status: 200, schema: linkableTasksSchema })
  @Get('tasks') async linkable(@CurrentUser() user: User, @Query('projectId') projectId: string) { return this.service.linkable(user, projectId); }
  @ApiOperation({ summary: 'PR ekle (pr.create yetkisi)' })
  @ApiBody({ schema: newPullRequestSchema })
  @ApiResponse({ status: 400, description: 'Geçersiz istek.' })
  @ApiResponse({ status: 201, schema: pullRequestsSchema })
  @Post() async create(@CurrentUser() user: User, @Body(new DtoPipe(createPullRequestSchema)) body: CreatePullRequestDto, @Query('view') view?: string) { return this.service.create(user, body, view); }
  @ApiOperation({ summary: 'PR’ı düzenle (pr.update yetkisi)' })
  @ApiParam({ name: 'id', type: Number, example: 12 })
  @ApiBody({ schema: editPullRequestSchema })
  @ApiResponse({ status: 404, description: 'Kayıt bulunamadı.' })
  @ApiResponse({ status: 200, schema: pullRequestsSchema })
  @Patch(':id') async update(@CurrentUser() user: User, @Param('id', ParseId) id: number, @Body(new DtoPipe(updatePullRequestSchema)) body: UpdatePullRequestDto, @Query('view') view?: string) { return this.service.update(user, id, body, view); }
  @ApiOperation({ summary: 'PR durumunu değiştir — onaylandı/kapatıldı/bekliyor (pr.merge yetkisi)' })
  @ApiParam({ name: 'id', type: Number, example: 12 })
  @ApiBody({ schema: statePullRequestSchema })
  @ApiResponse({ status: 404, description: 'Kayıt bulunamadı.' })
  @ApiResponse({ status: 200, schema: pullRequestsSchema })
  @Patch(':id/state') async setState(@CurrentUser() user: User, @Param('id', ParseId) id: number, @Body(new DtoPipe(pullRequestStateSchema)) body: PullRequestStateDto, @Query('view') view?: string) { return this.service.setState(user, id, body, view); }
  @ApiOperation({ summary: 'PR’ı sil (pr.delete yetkisi)' })
  @ApiParam({ name: 'id', type: Number, example: 12 })
  @ApiResponse({ status: 404, description: 'Kayıt bulunamadı.' })
  @ApiResponse({ status: 200, schema: pullRequestsSchema })
  @Delete(':id') async remove(@CurrentUser() user: User, @Param('id', ParseId) id: number, @Query('view') view?: string) { return this.service.remove(user, id, view); }
}
