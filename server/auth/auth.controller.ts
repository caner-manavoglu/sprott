import { Body, Controller, Get, Inject, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { type AuthRequest } from '../common/auth.ts';
import { DtoPipe } from '../common/dto.pipe.ts';
import { userSchema } from '../common/schemas.ts';
import { loginSchema, sessionSchema } from './auth.schemas.ts';
import { AuthService } from './auth.service.ts';
import { loginBodySchema, type LoginDto } from './dto/auth.dto.ts';

@ApiTags('Oturum')
@Controller('api')
export class AuthController {
  constructor(@Inject(AuthService) private service: AuthService) { }
  @ApiOperation({ summary: 'Yönetici veya kullanıcı olarak giriş yap' })
  @ApiBody({ schema: loginSchema })
  @ApiResponse({ status: 400, description: 'Geçersiz istek.' })
  @ApiResponse({ status: 201, schema: sessionSchema })
  @Post('login') async login(@Req() req: Request, @Body(new DtoPipe(loginBodySchema)) body: LoginDto) { return this.service.login(req, body); }
  @ApiOperation({ summary: 'Oturumu kapat' })
  @ApiResponse({ status: 201, schema: { type: 'object', properties: { ok: { type: 'boolean', example: true } } } })
  @Post('logout') async logout(@Req() req: Request) { return this.service.logout(req); }
  @ApiOperation({ summary: 'Aktif kullanıcıyı getir' })
  @ApiBearerAuth('bearer')
  @ApiResponse({ status: 401, description: 'Oturum gerekli.' })
  @ApiResponse({ status: 200, schema: userSchema })
  @Get('me') me(@Req() req: AuthRequest) { return this.service.me(req); }
}
