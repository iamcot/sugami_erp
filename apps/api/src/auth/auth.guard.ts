import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';
import { type AuthUser, SESSION_COOKIE } from './auth.types.js';
import { IS_PUBLIC, PERMISSIONS } from './decorators.js';
import { hasPermission } from './permissions.js';

/** Global guard: every route needs a valid session unless marked @Public(); checks @RequirePermissions(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    const user = await this.auth.validate(token);
    if (!user) throw new UnauthorizedException('Chưa đăng nhập');
    req.user = user;

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS, targets) ?? [];
    const missing = required.filter((p) => !hasPermission(user.permissions, p));
    if (missing.length) throw new ForbiddenException(`Không có quyền: ${missing.join(', ')}`);
    return true;
  }
}
