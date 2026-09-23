import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req, Res, UploadedFile, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { type AuthRequest } from '../common/auth.ts';
import { DtoPipe } from '../common/dto.pipe.ts';
import { editMessageSchema, messageReceiptsSchema, saveForumSchema, sendMessageSchema, type EditMessageDto, type MessageReceiptsDto, type SaveForumDto, type SendMessageDto } from './dto/forums.dto.ts';
import { ForumsService } from './forums.service.ts';

type Upload = { originalname: string; mimetype: string; buffer: Buffer; size: number };
const forumImageUpload = FileInterceptor('image', { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 2 } });

@ApiTags('Forum / Toplantı Notları')
@ApiBearerAuth('bearer')
@Controller('api/forums')
export class ForumsController {
  constructor(@Inject(ForumsService) private service: ForumsService) { }
  @Get() async list(@Req() req: AuthRequest) { return this.service.list(req); }
  @Get(':id/image') async imageFile(@Req() req: AuthRequest, @Param('id') raw: string, @Res() response: Response) { return this.service.imageFile(req, raw, response); }
  @Post()
  @UseInterceptors(forumImageUpload)
  async create(@Req() req: AuthRequest, @Body(new DtoPipe(saveForumSchema)) body: SaveForumDto, @UploadedFile() file?: Upload) { return this.service.create(req, body, file); }
  @Patch(':id')
  @UseInterceptors(forumImageUpload)
  async update(@Req() req: AuthRequest, @Param('id') raw: string, @Body(new DtoPipe(saveForumSchema)) body: SaveForumDto, @UploadedFile() file?: Upload) { return this.service.update(req, raw, body, file); }
  @Delete(':id') async remove(@Req() req: AuthRequest, @Param('id') raw: string) { return this.service.remove(req, raw); }
  @Post(':id/join') async join(@Req() req: AuthRequest, @Param('id') raw: string) { return this.service.join(req, raw); }
  @Get(':id/people') async people(@Req() req: AuthRequest, @Param('id') raw: string) { return this.service.people(req, raw); }
  @Post(':id/members/:userId') async add(@Req() req: AuthRequest, @Param('id') raw: string, @Param('userId') person: string) { return this.service.add(req, raw, person); }
  @Delete(':id/members/:userId') async reject(@Req() req: AuthRequest, @Param('id') raw: string, @Param('userId') person: string) { return this.service.reject(req, raw, person); }
  @Get('deliveries') async deliveries(@Req() req: AuthRequest) { return this.service.deliveries(req); }
  @Post('receipts') async receipts(@Req() req: AuthRequest, @Body(new DtoPipe(messageReceiptsSchema)) body: MessageReceiptsDto, @Res({ passthrough: true }) response: Response) { return this.service.receipts(req, body, response); }
  @Get(':id/messages') async messages(@Req() req: AuthRequest, @Param('id') raw: string, @Query('before') before?: string) { return this.service.messages(req, raw, before); }
  @Post(':id/messages')
  @UseInterceptors(FilesInterceptor('files', 5, { limits: { fileSize: 10 * 1024 * 1024, files: 5, fields: 1, fieldSize: 20000 } }))
  async send(@Req() req: AuthRequest, @Param('id') raw: string, @Body(new DtoPipe(sendMessageSchema)) body: SendMessageDto, @UploadedFiles() files: { originalname: string; mimetype: string; buffer: Buffer; size: number }[] = []) { return this.service.send(req, raw, body, files); }
  @Get(':id/files/:fileId') async file(@Req() req: AuthRequest, @Param('id') raw: string, @Param('fileId') fileId: string, @Res() response: Response) { return this.service.file(req, raw, fileId, response); }
  @Patch(':id/messages/:messageId') async editMessage(@Req() req: AuthRequest, @Param('id') raw: string, @Param('messageId') rawMessage: string, @Body(new DtoPipe(editMessageSchema)) body: EditMessageDto) { return this.service.editMessage(req, raw, rawMessage, body); }
  @Delete(':id/messages/:messageId') async deleteMessage(@Req() req: AuthRequest, @Param('id') raw: string, @Param('messageId') rawMessage: string, @Query('scope') scope: string) { return this.service.deleteMessage(req, raw, rawMessage, scope); }
  @Get(':id/messages/:messageId/receipts') async messageReceipts(@Req() req: AuthRequest, @Param('id') raw: string, @Param('messageId') rawMessage: string) { return this.service.messageReceipts(req, raw, rawMessage); }
}
