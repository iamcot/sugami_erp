import { createHash, randomBytes } from 'node:crypto';
import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { hashPassword, verifyPassword } from '@sugami/db';
import { PrismaService } from '../prisma/prisma.service.js';
import { type AuthUser, LOCK_MS, MAX_FAILED_LOGINS, SESSION_TTL_MS } from './auth.types.js';
import { collectPermissions } from './permissions.js';

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const INVALID = 'Email hoặc mật khẩu không đúng';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  /** Verify credentials and create a session. Returns the raw token for the cookie. */
  async login(
    emailInput: string,
    password: string,
    meta: { userAgent?: string; ip?: string } = {},
  ): Promise<{ token: string; expiresAt: Date }> {
    const email = emailInput.trim().toLowerCase();
    const user = await this.db.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      // Same work and message whether or not the account exists.
      await verifyPassword(password, 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAA');
      throw new UnauthorizedException(INVALID);
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new HttpException(
        'Tài khoản tạm khóa do đăng nhập sai nhiều lần, thử lại sau 15 phút',
        HttpStatus.LOCKED,
      );
    }
    if (!(await verifyPassword(password, user.passwordHash))) {
      const failed = user.failedLoginCount + 1;
      await this.db.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: failed >= MAX_FAILED_LOGINS ? 0 : failed,
          lockedUntil: failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MS) : user.lockedUntil,
        },
      });
      throw new UnauthorizedException(INVALID);
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await this.db.$transaction([
      this.db.session.create({
        data: {
          id: hashToken(token),
          userId: user.id,
          expiresAt,
          userAgent: meta.userAgent?.slice(0, 255),
          ip: meta.ip?.slice(0, 64),
        },
      }),
      this.db.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
      }),
    ]);
    return { token, expiresAt };
  }

  /** Resolve a session token to the user, or null if missing/expired/inactive. */
  async validate(token: string | undefined): Promise<AuthUser | null> {
    if (!token) return null;
    const session = await this.db.session.findUnique({
      where: { id: hashToken(token) },
      include: { user: { include: { roles: { include: { role: true } } } } },
    });
    if (!session || session.expiresAt <= new Date() || !session.user.isActive) return null;
    // Touch at most once an hour to avoid a write per request.
    if (Date.now() - session.lastSeenAt.getTime() > 3_600_000) {
      await this.db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
    }
    const roles = session.user.roles.map((ur) => ur.role);
    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      roles: roles.map((r) => r.code),
      permissions: collectPermissions(roles),
      sessionId: session.id,
    };
  }

  async logout(sessionId: string): Promise<void> {
    await this.db.session.deleteMany({ where: { id: sessionId } });
  }

  /** Change password and sign out every other session of this user. */
  async changePassword(user: AuthUser, currentPassword: string, newPassword: string): Promise<void> {
    const row = await this.db.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await verifyPassword(currentPassword, row.passwordHash))) {
      throw new UnauthorizedException('Mật khẩu hiện tại không đúng');
    }
    await this.db.$transaction([
      this.db.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(newPassword) },
      }),
      this.db.session.deleteMany({ where: { userId: user.id, NOT: { id: user.sessionId } } }),
    ]);
  }
}
