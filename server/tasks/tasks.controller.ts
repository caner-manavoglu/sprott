import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req, Res, UploadedFile, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { boardSchema } from '../board/board.schemas.ts';
import { type AuthRequest } from '../common/auth.ts';
import { DtoPipe } from '../common/dto.pipe.ts';
import { createTaskSchema, taskCommentSchema, updateTaskSchema, type CreateTaskDto, type TaskCommentDto, type UpdateTaskDto } from './dto/tasks.dto.ts';
import { editTaskSchema, myTasksSchema, taskSchema, taskSearchSchema } from './tasks.schemas.ts';
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
  @Get('mine') async mine(@Req() req: AuthRequest) { return this.service.mine(req); }
  @ApiOperation({ summary: 'Task ara (task.view yetkisi)' })
  @ApiQuery({ name: 'q', required: true, description: 'Task adı ve açıklamasında büyük/küçük harf duyarsız arama; en az iki karakter.', example: 'giriş' })
  @ApiResponse({ status: 200, schema: taskSearchSchema })
  @Get() async search(@Req() req: AuthRequest, @Query('q') q?: string) { return this.service.search(req, q); }
  @ApiOperation({ summary: 'Task oluştur (task.create yetkisi)' })
  @ApiBody({ schema: taskSchema })
  @ApiResponse({ status: 400, description: 'Geçersiz istek.' })
  @ApiResponse({ status: 201, schema: boardSchema })
  @Post() async create(@Req() req: AuthRequest, @Body(new DtoPipe(createTaskSchema)) body: CreateTaskDto) { return this.service.create(req, body); }
  @Post(':id/attachments')
  @UseInterceptors(FilesInterceptor('files', undefined, uploadOptions))
  async addAttachments(@Req() req: AuthRequest, @Param('id') id: string, @UploadedFiles() uploads: Upload[] | undefined) { return this.service.addAttachments(req, id, uploads); }
  @Patch(':id/attachments/:attachmentId')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  async replaceAttachment(@Req() req: AuthRequest, @Param('id') id: string, @Param('attachmentId') attachmentIdValue: string,
    @UploadedFile() upload: Upload | undefined) { return this.service.replaceAttachment(req, id, attachmentIdValue, upload); }
  @Delete(':id/attachments/:attachmentId')
  async deleteAttachment(@Req() req: AuthRequest, @Param('id') id: string, @Param('attachmentId') attachmentIdValue: string) { return this.service.deleteAttachment(req, id, attachmentIdValue); }
  @Get(':id/attachments/:attachmentId')
  async attachment(@Req() req: AuthRequest, @Res() response: Response, @Param('id') id: string, @Param('attachmentId') attachmentIdValue: string) { return this.service.attachment(req, response, id, attachmentIdValue); }
  @Post(':id/comments')
  @UseInterceptors(FilesInterceptor('files', undefined, uploadOptions))
  async addComment(@Req() req: AuthRequest, @Param('id') id: string, @Body(new DtoPipe(taskCommentSchema)) body: TaskCommentDto,
    @UploadedFiles() uploads: Upload[] | undefined) { return this.service.addComment(req, id, body, uploads); }
  @Patch(':id/comments/:commentId')
  @UseInterceptors(FilesInterceptor('files', undefined, uploadOptions))
  async updateComment(@Req() req: AuthRequest, @Param('id') id: string, @Param('commentId') commentIdValue: string,
    @Body(new DtoPipe(taskCommentSchema)) body: TaskCommentDto, @UploadedFiles() uploads: Upload[] | undefined) { return this.service.updateComment(req, id, commentIdValue, body, uploads); }
  @Delete(':id/comments/:commentId/attachments/:attachmentId')
  async deleteCommentAttachment(@Req() req: AuthRequest, @Param('id') id: string,
    @Param('commentId') commentIdValue: string, @Param('attachmentId') attachmentIdValue: string) { return this.service.deleteCommentAttachment(req, id, commentIdValue, attachmentIdValue); }
  @Delete(':id/comments/:commentId')
  async deleteComment(@Req() req: AuthRequest, @Param('id') id: string, @Param('commentId') commentIdValue: string) { return this.service.deleteComment(req, id, commentIdValue); }
  @Get(':id/comments/:commentId/attachments/:attachmentId')
  async commentAttachment(@Req() req: AuthRequest, @Res() response: Response, @Param('id') id: string,
    @Param('commentId') commentIdValue: string, @Param('attachmentId') attachmentIdValue: string) { return this.service.commentAttachment(req, response, id, commentIdValue, attachmentIdValue); }
  @ApiOperation({ summary: 'Task’ı güncelle (sütun, başlık, açıklama veya atanan kişi)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ schema: editTaskSchema })
  @ApiResponse({ status: 400, description: 'Geçersiz istek.' })
  @ApiResponse({ status: 404, description: 'Kayıt bulunamadı.' })
  @ApiResponse({ status: 200, schema: boardSchema })
  @Patch(':id') async update(@Req() req: AuthRequest, @Param('id') id: string, @Body(new DtoPipe(updateTaskSchema)) body: UpdateTaskDto) { return this.service.update(req, id, body); }
  @ApiOperation({ summary: 'Task sil (task.delete yetkisi)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiResponse({ status: 404, description: 'Kayıt bulunamadı.' })
  @ApiResponse({ status: 200, schema: boardSchema })
  @Delete(':id') async remove(@Req() req: AuthRequest, @Param('id') id: string) { return this.service.remove(req, id); }
}
