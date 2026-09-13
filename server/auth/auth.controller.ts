import { Body, Controller, ForbiddenException, Get, Inject, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { randomBytes } from 'node:crypto';
import { Store, type User, hash, matches, textField } from '../store.ts';
import { type AuthRequest, current, digest, token } from '../common/auth.ts';
import { userSchema } from '../common/schemas.ts';
import { loginSchema, sessionSchema } from './auth.schemas.ts';

const SESSION_MS = 43_200_000;

@ApiTags('Oturum')
@Controller('api')
export class AuthController {
  constructor(@Inject(Store) private store: Store) {}
  // ponytail: single-process rate limit; use a shared limiter when deploying multiple instances.
  private attempts = new Map<string, {count: number; until: number}>();
  @ApiOperation({summary: 'Yönetici veya kullanıcı olarak giriş yap'})
  @ApiBody({schema: loginSchema})
  @ApiResponse({status: 400, description: 'Geçersiz istek.'})
  @ApiResponse({status: 201, schema: sessionSchema})
  @Post('login') async login(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const now = Date.now();
    for (const [key, value] of this.attempts) if (value.until < now) this.attempts.delete(key);
    const key = req.ip || 'local';
    const limit = this.attempts.get(key) || {count: 0, until: now + 60_000};
    if (++limit.count > 10) throw new ForbiddenException('Çok fazla giriş denemesi. Bir dakika sonra tekrar deneyin.');
    this.attempts.set(key, limit);
    const email = textField(body.email, 'E-posta', 254).toLowerCase();
    if (typeof body.password !== 'string' || body.password.length > 256 || !['admin','user'].includes(String(body.role))) throw new UnauthorizedException('Giriş bilgileri hatalı.');
    const user = (await this.store.db.query('SELECT * FROM users WHERE email=$1', [email])).rows[0] as (User & {password: string}) | undefined;
    const valid = matches(body.password, user?.password || hash('dummy-password'));
    if (!user || !valid || user.role !== body.role) throw new UnauthorizedException('E-posta, şifre veya giriş türü hatalı.');
    await this.store.db.query('DELETE FROM sessions WHERE expires<$1 OR token=$2', [now, token(req)]);
    const session = randomBytes(32).toString('hex');
    await this.store.db.query('INSERT INTO sessions VALUES($1,$2,$3)', [digest(session), user.id, now + SESSION_MS]);
    return {...(await this.store.user(digest(session)))!, token: session};
  }
  @ApiOperation({summary: 'Oturumu kapat'})
  @ApiResponse({status: 201, schema: {type: 'object', properties: {ok: {type: 'boolean', example: true}}}})
  @Post('logout') async logout(@Req() req: Request) { await this.store.db.query('DELETE FROM sessions WHERE token=$1', [token(req)]); return {ok: true}; }
  @ApiOperation({summary: 'Aktif kullanıcıyı getir'})
  @ApiBearerAuth('bearer')
  @ApiResponse({status: 401, description: 'Oturum gerekli.'})
  @ApiResponse({status: 200, schema: userSchema})
  @Get('me') me(@Req() req: AuthRequest) { return current(req); }
}
