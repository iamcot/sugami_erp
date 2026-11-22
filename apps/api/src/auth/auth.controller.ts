import { BadRequestException, Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AuthService } from './auth.service.js';
import { type AuthUser, SESSION_COOKIE } from './auth.types.js';
import { CurrentUser, Public } from './decorators.js';

const LoginBody = z.object({ email: z.string().email(), password: z.string().min(1) });
const ChangePasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Mật khẩu mới tối thiểu 8 ký tự'),
});

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join('; '));
  return r.data;
}

const cookieOptions = (expires?: Date) => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  expires,
});

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { email, password } = parse(LoginBody, body);
    const { token, expiresAt } = await this.auth.login(email, password, {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
    res.cookie(SESSION_COOKIE, token, cookieOptions(expiresAt));
    const user = await this.auth.validate(token);
    return { user: user && { ...user, sessionId: undefined } };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user.sessionId);
    res.clearCookie(SESSION_COOKIE, cookieOptions());
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return { user: { ...user, sessionId: undefined } };
  }

  @Post('change-password')
  @HttpCode(204)
  async changePassword(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const { currentPassword, newPassword } = parse(ChangePasswordBody, body);
    await this.auth.changePassword(user, currentPassword, newPassword);
  }
}
