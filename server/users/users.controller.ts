import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { type AuthRequest } from '../common/auth.ts';
import { DtoPipe } from '../common/dto.pipe.ts';
import { usersSchema } from '../common/schemas.ts';
import { createUserSchema, updateProfileSchema, updateUserSchema, type CreateUserDto, type UpdateProfileDto, type UpdateUserDto } from './dto/users.dto.ts';
import { editUserSchema, newUserSchema } from './users.schemas.ts';
import { UsersService } from './users.service.ts';

@ApiTags('Kullanıcılar')
@ApiBearerAuth('bearer')
@ApiResponse({ status: 401, description: 'Oturum gerekli.' })
@ApiResponse({ status: 403, description: 'Yetki reddedildi.' })
@Controller('api/users')
export class UsersController {
  constructor(@Inject(UsersService) private service: UsersService) { }
  @ApiOperation({ summary: 'Kullanıcıları listele (user.view yetkisi)' })
  @ApiResponse({ status: 200, schema: usersSchema })
  @ApiQuery({ name: 'search', required: false, description: 'Ad, soyad veya e-postada büyük/küçük harf duyarsız arama.', example: 'caner' })
  @Get() index(@Req() req: AuthRequest, @Query('search') search?: string) { return this.service.index(req, search); }
  @Get(':id/avatar') async avatar(@Param('id') rawId: string, @Res() response: Response) { return this.service.avatar(rawId, response); }
  @ApiOperation({ summary: 'Kendi e-posta, şifre ve profil fotoğrafını güncelle' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('avatar', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @Patch('me') async me(@Req() req: AuthRequest, @Body(new DtoPipe(updateProfileSchema)) body: UpdateProfileDto, @UploadedFile() file?: { mimetype: string; buffer: Buffer }) { return this.service.me(req, body, file); }
  @ApiOperation({ summary: 'Kullanıcı oluştur (user.create yetkisi)' })
  @ApiBody({ schema: newUserSchema })
  @ApiResponse({ status: 400, description: 'Geçersiz istek.' })
  @ApiResponse({ status: 201, schema: usersSchema })
  @Post() async create(@Req() req: AuthRequest, @Body(new DtoPipe(createUserSchema)) body: CreateUserDto) { return this.service.create(req, body); }
  @ApiOperation({ summary: 'Kullanıcıyı güncelle (user.update yetkisi)' })
  @ApiParam({ name: 'id', type: Number, example: 2 })
  @ApiBody({ schema: editUserSchema })
  @ApiResponse({ status: 400, description: 'Geçersiz istek.' })
  @ApiResponse({ status: 404, description: 'Kayıt bulunamadı.' })
  @ApiResponse({ status: 200, schema: usersSchema })
  @Patch(':id') async edit(@Req() req: AuthRequest, @Param('id') id: string, @Body(new DtoPipe(updateUserSchema)) body: UpdateUserDto) { return this.service.edit(req, id, body); }
  @ApiOperation({ summary: 'Kullanıcıyı sil (user.delete yetkisi)' })
  @ApiParam({ name: 'id', type: Number, example: 2 })
  @ApiResponse({ status: 400, description: 'Geçersiz istek.' })
  @ApiResponse({ status: 404, description: 'Kayıt bulunamadı.' })
  @ApiResponse({ status: 200, schema: usersSchema })
  @Delete(':id') async remove(@Req() req: AuthRequest, @Param('id') rawId: string) { return this.service.remove(req, rawId); }
}
