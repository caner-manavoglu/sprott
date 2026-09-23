import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { clearSessionCookie, digest, setSessionCookie, token } from '../common/auth.ts';
import { hash, matches } from '../common/fields.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { WorkspaceService } from '../workspace/workspace.service.ts';
import { type LoginDto } from './dto/auth.dto.ts';

const SESSION_MS = 43_200_000;
// Kullanıcı yokken de aynı sürede yanıt vermek için sabit bir özetle karşılaştırılır.
const DUMMY_PASSWORD = hash('dummy-password');

@Injectable()
export class AuthService {
  constructor(@Inject(WorkspaceService) private workspace: WorkspaceService, @Inject(PrismaService) private prisma: PrismaService) { }
  // ponytail: single-process rate limit; use a shared limiter for multiple instances.
  private attempts = new Map<string, { count: number; until: number }>();
  async login(req: Request, res: Response, body: LoginDto) {
    const now = Date.now();
    for (const [key, value] of this.attempts) if (value.until < now) this.attempts.delete(key);
    const key = req.ip || 'local';
    const limit = this.attempts.get(key) || { count: 0, until: now + 60_000 };
    if (++limit.count > 10) throw new ForbiddenException('Çok fazla giriş denemesi. Bir dakika sonra tekrar deneyin.');
    this.attempts.set(key, limit);
    // Rol veritabanındaki kayıttan gelir; girişte ayrıca seçilmez.
    const user = await this.prisma.user.findUnique({ where: { email: body.email }, select: { id: true, password: true } });
    const valid = matches(body.password, user?.password || DUMMY_PASSWORD);
    if (!user || !valid) throw new UnauthorizedException('E-posta veya şifre hatalı.');
    await this.prisma.session.deleteMany({ where: { OR: [{ expires: { lt: BigInt(now) } }, { token: token(req) }] } });
    const session = randomBytes(32).toString('hex');
    await this.prisma.session.create({ data: { token: digest(session), userId: user.id, expires: BigInt(now + SESSION_MS) } });
    setSessionCookie(res, session, SESSION_MS);
    // Token yanıtta da döner: Swagger ve betikler bearer başlığıyla kullanır, tarayıcı çerezle.
    return { ...(await this.workspace.user(digest(session)))!, token: session };
  }
  async logout(req: Request, res: Response) {
    const key = token(req);
    if (key) await this.prisma.session.deleteMany({ where: { token: key } });
    clearSessionCookie(res);
    return { ok: true };
  }
}
