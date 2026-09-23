import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Res, UploadedFile, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser, ParseId } from '../common/auth.ts';
import type { User } from '../common/fields.ts';
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
  @Get() async list(@CurrentUser() user: User) { return this.service.list(user); }
  @Get(':id/image') async imageFile(@CurrentUser() user: User, @Param('id', ParseId) id: number, @Res() response: Response) { return this.service.imageFile(user, id, response); }
  @Post()
  @UseInterceptors(forumImageUpload)
  async create(@CurrentUser() user: User, @Body(new DtoPipe(saveForumSchema)) body: SaveForumDto, @UploadedFile() file?: Upload) { return this.service.create(user, body, file); }
  @Patch(':id')
  @UseInterceptors(forumImageUpload)
  async update(@CurrentUser() user: User, @Param('id', ParseId) id: number, @Body(new DtoPipe(saveForumSchema)) body: SaveForumDto, @UploadedFile() file?: Upload) { return this.service.update(user, id, body, file); }
  @Delete(':id') async remove(@CurrentUser() user: User, @Param('id', ParseId) id: number) { return this.service.remove(user, id); }
  @Post(':id/join') async join(@CurrentUser() user: User, @Param('id', ParseId) id: number) { return this.service.join(user, id); }
  @Get(':id/people') async people(@CurrentUser() user: User, @Param('id', ParseId) id: number) { return this.service.people(user, id); }
  @Post(':id/members/:userId') async add(@CurrentUser() user: User, @Param('id', ParseId) id: number, @Param('userId', ParseId) userId: number) { return this.service.add(user, id, userId); }
  @Delete(':id/members/:userId') async reject(@CurrentUser() user: User, @Param('id', ParseId) id: number, @Param('userId', ParseId) userId: number) { return this.service.reject(user, id, userId); }
  @Get('deliveries') async deliveries(@CurrentUser() user: User) { return this.service.deliveries(user); }
  @Post('receipts') async receipts(@CurrentUser() user: User, @Body(new DtoPipe(messageReceiptsSchema)) body: MessageReceiptsDto, @Res({ passthrough: true }) response: Response) { return this.service.receipts(user, body, response); }
  @Get(':id/messages') async messages(@CurrentUser() user: User, @Param('id', ParseId) id: number, @Query('before') before?: string) { return this.service.messages(user, id, before); }
  @Post(':id/messages')
  @UseInterceptors(FilesInterceptor('files', 5, { limits: { fileSize: 10 * 1024 * 1024, files: 5, fields: 1, fieldSize: 20000 } }))
  async send(@CurrentUser() user: User, @Param('id', ParseId) id: number, @Body(new DtoPipe(sendMessageSchema)) body: SendMessageDto, @UploadedFiles() files: { originalname: string; mimetype: string; buffer: Buffer; size: number }[] = []) { return this.service.send(user, id, body, files); }
  @Get(':id/files/:fileId') async file(@CurrentUser() user: User, @Param('id', ParseId) id: number, @Param('fileId', ParseId) fileId: number, @Res() response: Response) { return this.service.file(user, id, fileId, response); }
  @Patch(':id/messages/:messageId') async editMessage(@CurrentUser() user: User, @Param('id', ParseId) id: number, @Param('messageId', ParseId) messageId: number, @Body(new DtoPipe(editMessageSchema)) body: EditMessageDto) { return this.service.editMessage(user, id, messageId, body); }
  @Delete(':id/messages/:messageId') async deleteMessage(@CurrentUser() user: User, @Param('id', ParseId) id: number, @Param('messageId', ParseId) messageId: number, @Query('scope') scope: string) { return this.service.deleteMessage(user, id, messageId, scope); }
  @Get(':id/messages/:messageId/receipts') async messageReceipts(@CurrentUser() user: User, @Param('id', ParseId) id: number, @Param('messageId', ParseId) messageId: number) { return this.service.messageReceipts(user, id, messageId); }
}
