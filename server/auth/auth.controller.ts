import { Body, Controller, Get, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentUser } from '../common/auth.ts';
import { DtoPipe } from '../common/dto.pipe.ts';
import type { User } from '../common/fields.ts';
import { userSchema } from '../common/schemas.ts';
import { loginSchema, sessionSchema } from './auth.schemas.ts';
import { AuthService } from './auth.service.ts';
import { loginBodySchema, type LoginDto } from './dto/auth.dto.ts';

@ApiTags('Oturum')
@Controller('api')
export class AuthController {
  constructor(@Inject(AuthService) private service: AuthService) { }
  @ApiOperation({ summary: 'Giriş yap; tarayıcıya httpOnly oturum çerezi yazılır, token yanıtta da döner' })
  @ApiBody({ schema: loginSchema })
  @ApiResponse({ status: 400, description: 'Geçersiz istek.' })
  @ApiResponse({ status: 201, schema: sessionSchema })
  @Post('login') async login(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body(new DtoPipe(loginBodySchema)) body: LoginDto) { return this.service.login(req, res, body); }
  @ApiOperation({ summary: 'Oturumu kapat' })
  @ApiResponse({ status: 201, schema: { type: 'object', properties: { ok: { type: 'boolean', example: true } } } })
  @Post('logout') async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) { return this.service.logout(req, res); }
  @ApiOperation({ summary: 'Aktif kullanıcıyı getir' })
  @ApiBearerAuth('bearer')
  @ApiResponse({ status: 401, description: 'Oturum gerekli.' })
  @ApiResponse({ status: 200, schema: userSchema })
  @Get('me') me(@CurrentUser() user: User) { return user; }
}
