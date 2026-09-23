import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { randomBytes } from 'node:crypto';
import { type AuthRequest, current, digest, token } from '../common/auth.ts';
import { hash, matches, textField, type User } from '../common/fields.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { WorkspaceService } from '../workspace/workspace.service.ts';
import { type LoginDto } from './dto/auth.dto.ts';

const SESSION_MS = 43_200_000;

@Injectable()
export class AuthService {
  constructor(@Inject(WorkspaceService) private workspace: WorkspaceService, @Inject(PrismaService) private prisma: PrismaService) { }
  // ponytail: single-process rate limit; use a shared limiter for multiple instances.
  private attempts = new Map<string, { count: number; until: number }>();
  async login(req: Request, body: LoginDto) {
    const now = Date.now();
    for (const [key, value] of this.attempts) if (value.until < now) this.attempts.delete(key);
    const key = req.ip || 'local';
    const limit = this.attempts.get(key) || { count: 0, until: now + 60_000 };
    if (++limit.count > 10) throw new ForbiddenException('Çok fazla giriş denemesi. Bir dakika sonra tekrar deneyin.');
    this.attempts.set(key, limit);
    const email = textField(body.email, 'E-posta', 254).toLowerCase();
    if (typeof body.password !== 'string' || body.password.length > 256 || !['admin', 'user'].includes(String(body.role))) throw new UnauthorizedException('Giriş bilgileri hatalı.');
    const user = (await this.prisma.user.findFirst({ where: { email }, })) as (User & { password: string }) | undefined;
    const valid = matches(body.password, user?.password || hash('dummy-password'));
    if (!user || !valid || user.role !== body.role) throw new UnauthorizedException('E-posta, şifre veya giriş türü hatalı.');
    await this.prisma.session.deleteMany({ where: { OR: [{ expires: { lt: BigInt(now) } }, { token: token(req) }] } });
    const session = randomBytes(32).toString('hex');
    await this.prisma.session.create({ data: { token: digest(session), userId: user.id, expires: BigInt(now + SESSION_MS) } });
    return { ...(await this.workspace.user(digest(session)))!, token: session };
  }
  async logout(req: Request) { (await this.prisma.session.deleteMany({ where: { token: token(req) }, })); return { ok: true }; }
  me(req: AuthRequest) { return current(req); }
}
