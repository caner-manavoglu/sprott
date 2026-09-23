import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Res, UploadedFile, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiProduces, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { boardSchema } from '../board/board.schemas.ts';
import { CurrentUser, ParseId } from '../common/auth.ts';
import type { User } from '../common/fields.ts';
import { DtoPipe } from '../common/dto.pipe.ts';
import { createTaskSchema, taskCommentSchema, updateTaskSchema, type CreateTaskDto, type TaskCommentDto, type UpdateTaskDto } from './dto/tasks.dto.ts';
import { commentBodySchema, commentsSchema, editTaskSchema, fileBodySchema, filesBodySchema, myTasksSchema, taskSchema, taskSearchSchema } from './tasks.schemas.ts';
import { TasksService } from './tasks.service.ts';
type Upload = { originalname: string; mimetype: string; size: number; buffer: Buffer };
const uploadOptions = { limits: { fileSize: 25 * 1024 * 1024 } };

@ApiTags('Task’lar')
@ApiBearerAuth('bearer')
@ApiResponse({ status: 401, description: 'Oturum gerekli.' })
@ApiResponse({ status: 403, description: 'Yetki reddedildi.' })
@Controller('api/tasks')
export class TasksController {
  constructor(@Inject(TasksService) private service: TasksService) { }
  @ApiOperation({ summary: 'Bana atanan task’lar (task.view yetkisi)' })
  @ApiResponse({ status: 200, schema: myTasksSchema })
  @Get('mine') async mine(@CurrentUser() user: User) { return this.service.mine(user); }
  @ApiOperation({ summary: 'Task ara (task.view yetkisi)' })
  @ApiQuery({ name: 'q', required: true, description: 'Task adı ve açıklamasında büyük/küçük harf duyarsız arama; en az iki karakter.', example: 'giriş' })
  @ApiResponse({ status: 200, schema: taskSearchSchema })
  @Get() async search(@CurrentUser() user: User, @Query('q') q?: string) { return this.service.search(user, q); }
  @ApiOperation({ summary: 'Task oluştur (task.create yetkisi)' })
  @ApiBody({ schema: taskSchema })
  @ApiResponse({ status: 400, description: 'Geçersiz istek.' })
  @ApiResponse({ status: 201, schema: boardSchema })
  @Post() async create(@CurrentUser() user: User, @Body(new DtoPipe(createTaskSchema)) body: CreateTaskDto) { return this.service.create(user, body); }
  @ApiOperation({ summary: 'Task’a dosya ekle (task.update veya kendi task’ında task.create; en fazla 25 MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: filesBodySchema })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiResponse({ status: 404, description: 'Kayıt bulunamadı.' })
  @ApiResponse({ status: 201, schema: boardSchema })
  @Post(':id/attachments')
  @UseInterceptors(FilesInterceptor('files', undefined, uploadOptions))
  async addAttachments(@CurrentUser() user: User, @Param('id', ParseId) id: number, @UploadedFiles() uploads: Upload[] | undefined) { return this.service.addAttachments(user, id, uploads); }
  @ApiOperation({ summary: 'Task dosyasını yenisiyle değiştir' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: fileBodySchema })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiParam({ name: 'attachmentId', type: Number, example: 1 })
  @ApiResponse({ status: 404, description: 'Kayıt bulunamadı.' })
  @ApiResponse({ status: 200, schema: boardSchema })
  @Patch(':id/attachments/:attachmentId')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  async replaceAttachment(@CurrentUser() user: User, @Param('id', ParseId) id: number, @Param('attachmentId', ParseId) attachmentId: number,
    @UploadedFile() upload: Upload | undefined) { return this.service.replaceAttachment(user, id, attachmentId, upload); }
  @ApiOperation({ summary: 'Task dosyasını sil' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiParam({ name: 'attachmentId', type: Number, example: 1 })
  @ApiResponse({ status: 404, description: 'Kayıt bulunamadı.' })
  @ApiResponse({ status: 200, schema: boardSchema })
  @Delete(':id/attachments/:attachmentId')
  async deleteAttachment(@CurrentUser() user: User, @Param('id', ParseId) id: number, @Param('attachmentId', ParseId) attachmentId: number) { return this.service.deleteAttachment(user, id, attachmentId); }
  @ApiOperation({ summary: 'Task dosyasını indir (task.view yetkisi)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiParam({ name: 'attachmentId', type: Number, example: 1 })
  @ApiResponse({ status: 404, description: 'Kayıt bulunamadı.' })
  @ApiProduces('application/octet-stream')
  @ApiResponse({ status: 200, description: 'Dosya içeriği (Content-Disposition: attachment).' })
  @Get(':id/attachments/:attachmentId')
  async attachment(@CurrentUser() user: User, @Res() response: Response, @Param('id', ParseId) id: number, @Param('attachmentId', ParseId) attachmentId: number) { return this.service.attachment(user, response, id, attachmentId); }
  @ApiOperation({ summary: 'Yorum ekle; etiketlenenlere ve atanan kişiye bildirim gider' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: commentBodySchema })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiResponse({ status: 400, description: 'Geçersiz istek veya proje dışı etiket.' })
  @ApiResponse({ status: 201, schema: commentsSchema })
  @Post(':id/comments')
  @UseInterceptors(FilesInterceptor('files', undefined, uploadOptions))
  async addComment(@CurrentUser() user: User, @Param('id', ParseId) id: number, @Body(new DtoPipe(taskCommentSchema)) body: TaskCommentDto,
    @UploadedFiles() uploads: Upload[] | undefined) { return this.service.addComment(user, id, body, uploads); }
  @ApiOperation({ summary: 'Kendi yorumunu düzenle; yeni dosyalar mevcut eklere eklenir' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: commentBodySchema })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiParam({ name: 'commentId', type: Number, example: 1 })
  @ApiResponse({ status: 404, description: 'Kayıt bulunamadı.' })
  @ApiResponse({ status: 200, schema: commentsSchema })
  @Patch(':id/comments/:commentId')
  @UseInterceptors(FilesInterceptor('files', undefined, uploadOptions))
  async updateComment(@CurrentUser() user: User, @Param('id', ParseId) id: number, @Param('commentId', ParseId) commentId: number,
    @Body(new DtoPipe(taskCommentSchema)) body: TaskCommentDto, @UploadedFiles() uploads: Upload[] | undefined) { return this.service.updateComment(user, id, commentId, body, uploads); }
  @ApiOperation({ summary: 'Kendi yorumundan dosya kaldır' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiParam({ name: 'commentId', type: Number, example: 1 })
  @ApiParam({ name: 'attachmentId', type: Number, example: 1 })
  @ApiResponse({ status: 404, description: 'Kayıt bulunamadı.' })
  @ApiResponse({ status: 200, schema: commentsSchema })
  @Delete(':id/comments/:commentId/attachments/:attachmentId')
  async deleteCommentAttachment(@CurrentUser() user: User, @Param('id', ParseId) id: number,
    @Param('commentId', ParseId) commentId: number, @Param('attachmentId', ParseId) attachmentId: number) { return this.service.deleteCommentAttachment(user, id, commentId, attachmentId); }
  @ApiOperation({ summary: 'Kendi yorumunu sil' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiParam({ name: 'commentId', type: Number, example: 1 })
  @ApiResponse({ status: 404, description: 'Kayıt bulunamadı.' })
  @ApiResponse({ status: 200, schema: commentsSchema })
  @Delete(':id/comments/:commentId')
  async deleteComment(@CurrentUser() user: User, @Param('id', ParseId) id: number, @Param('commentId', ParseId) commentId: number) { return this.service.deleteComment(user, id, commentId); }
  @ApiOperation({ summary: 'Task yorumlarını getir (task.view yetkisi)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiResponse({ status: 404, description: 'Kayıt bulunamadı.' })
  @ApiResponse({ status: 200, schema: commentsSchema })
  @Get(':id/comments') async comments(@CurrentUser() user: User, @Param('id', ParseId) id: number) { return this.service.comments(user, id); }
  @ApiOperation({ summary: 'Yorum dosyasını indir (task.view yetkisi)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiParam({ name: 'commentId', type: Number, example: 1 })
  @ApiParam({ name: 'attachmentId', type: Number, example: 1 })
  @ApiResponse({ status: 404, description: 'Kayıt bulunamadı.' })
  @ApiProduces('application/octet-stream')
  @ApiResponse({ status: 200, description: 'Dosya içeriği (Content-Disposition: attachment).' })
  @Get(':id/comments/:commentId/attachments/:attachmentId')
  async commentAttachment(@CurrentUser() user: User, @Res() response: Response, @Param('id', ParseId) id: number,
    @Param('commentId', ParseId) commentId: number, @Param('attachmentId', ParseId) attachmentId: number) { return this.service.commentAttachment(user, response, id, commentId, attachmentId); }
  @ApiOperation({ summary: 'Task’ı güncelle (sütun, başlık, açıklama veya atanan kişi)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ schema: editTaskSchema })
  @ApiResponse({ status: 400, description: 'Geçersiz istek.' })
  @ApiResponse({ status: 404, description: 'Kayıt bulunamadı.' })
  @ApiResponse({ status: 200, schema: boardSchema })
  @Patch(':id') async update(@CurrentUser() user: User, @Param('id', ParseId) id: number, @Body(new DtoPipe(updateTaskSchema)) body: UpdateTaskDto) { return this.service.update(user, id, body); }
  @ApiOperation({ summary: 'Task sil (task.delete yetkisi)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiResponse({ status: 404, description: 'Kayıt bulunamadı.' })
  @ApiResponse({ status: 200, schema: boardSchema })
  @Delete(':id') async remove(@CurrentUser() user: User, @Param('id', ParseId) id: number) { return this.service.remove(user, id); }
}
