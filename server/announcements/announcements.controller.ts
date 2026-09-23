import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser, ParseId } from '../common/auth.ts';
import type { User } from '../common/fields.ts';
import { DtoPipe } from '../common/dto.pipe.ts';
import { announcementDetailSchema, announcementsSchema, editAnnouncementSchema, newAnnouncementSchema } from './announcements.schemas.ts';
import { AnnouncementsService } from './announcements.service.ts';
import { createAnnouncementSchema, updateAnnouncementSchema, type CreateAnnouncementDto, type UpdateAnnouncementDto } from './dto/announcements.dto.ts';

type Upload = { originalname: string; mimetype: string; size: number; buffer: Buffer };
const imageOptions = { limits: { fileSize: 10 * 1024 * 1024 } };

@ApiTags('Duyurular')
@ApiBearerAuth('bearer')
@ApiResponse({ status: 401, description: 'Oturum gerekli.' })
@ApiResponse({ status: 403, description: 'Yetki reddedildi.' })
@Controller('api/announcements')
export class AnnouncementsController {
  constructor(@Inject(AnnouncementsService) private service: AnnouncementsService) { }
  @ApiOperation({ summary: 'Bana açık duyurular' })
  @ApiResponse({ status: 200, schema: announcementsSchema })
  @Get() index(@CurrentUser() user: User) { return this.service.index(user); }
  @ApiOperation({ summary: 'Girişte açılacak zorunlu duyurular: bana açık, zorunlu ve henüz okumadıklarım' })
  @ApiResponse({ status: 200, schema: announcementsSchema })
  @Get('pending') async pending(@CurrentUser() user: User) { return this.service.pending(user); }
  @ApiOperation({ summary: 'Duyuru yapabileceğim gruplar: yönetici için tümü, grup yöneticisi için yönettikleri' })
  @ApiResponse({ status: 200, description: 'Grup listesi.' })
  @Get('groups') async audience(@CurrentUser() user: User) { return this.service.audience(user); }
  @ApiOperation({ summary: 'Duyuru oluştur (yönetici veya duyuru yetkisi olan grup yöneticisi)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: newAnnouncementSchema })
  @ApiResponse({ status: 400, description: 'Geçersiz istek.' })
  @ApiResponse({ status: 201, schema: announcementsSchema })
  @Post()
  @UseInterceptors(FileInterceptor('image', imageOptions))
  async create(@CurrentUser() user: User, @Body(new DtoPipe(createAnnouncementSchema)) body: CreateAnnouncementDto, @UploadedFile() upload?: Upload) { return this.service.create(user, body, upload); }
  @ApiOperation({ summary: 'Duyuruyu düzenle (duyuruyu yazan kişi veya yönetici); zorunlu duyurular düzenlenemez' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: editAnnouncementSchema })
  @ApiResponse({ status: 400, description: 'Geçersiz istek.' })
  @ApiResponse({ status: 403, description: 'Zorunlu duyuru düzenlenemez.' })
  @ApiResponse({ status: 200, schema: announcementsSchema })
  @Patch(':id')
  @UseInterceptors(FileInterceptor('image', imageOptions))
  async update(@CurrentUser() user: User, @Param('id', ParseId) id: number, @Body(new DtoPipe(updateAnnouncementSchema)) body: UpdateAnnouncementDto, @UploadedFile() upload?: Upload) { return this.service.update(user, id, body, upload); }
  @ApiOperation({ summary: 'Zorunlu duyuruyu okundu işaretle; aynı duyurunun bildirimi de okunmuş sayılır' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiResponse({ status: 400, description: 'Zorunlu olmayan duyuruda okundu takibi yapılmaz.' })
  @ApiResponse({ status: 200, schema: announcementsSchema })
  @Patch(':id/read') async read(@CurrentUser() user: User, @Param('id', ParseId) id: number) { return this.service.read(user, id); }
  @ApiOperation({ summary: 'Duyuru görselini indir' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiResponse({ status: 200, description: 'Görsel içeriği.' })
  @Get(':id/image') async picture(@CurrentUser() user: User, @Param('id', ParseId) id: number, @Res() response: Response) { return this.service.picture(user, id, response); }
  @ApiOperation({ summary: 'Zorunlu duyurunun okuma raporu (duyuruyu yazan kişi veya yönetici)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiResponse({ status: 400, description: 'Zorunlu olmayan duyurunun okuma raporu tutulmaz.' })
  @ApiResponse({ status: 404, description: 'Duyuru bulunamadı.' })
  @ApiResponse({ status: 200, schema: announcementDetailSchema })
  @Get(':id') async detail(@CurrentUser() user: User, @Param('id', ParseId) id: number) { return this.service.detail(user, id); }
  @ApiOperation({ summary: 'Duyuruyu sil (duyuruyu yazan kişi veya yönetici)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiResponse({ status: 200, schema: announcementsSchema })
  @Delete(':id') async remove(@CurrentUser() user: User, @Param('id', ParseId) id: number) { return this.service.remove(user, id); }
}
