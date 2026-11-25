import { Body, ConflictException, Controller, Get, Post } from '@nestjs/common';
import { hashPassword } from '@sugami/db';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser, RequirePermissions } from '../auth/decorators.js';
import { parseInput } from '../common/validation.js';
import { PrismaService } from '../prisma/prisma.service.js';

const CreateUserBody = z.object({
  name: z.string().trim().min(1, 'Nhập tên').max(191),
  email: z.string().trim().toLowerCase().email('Email không hợp lệ'),
  password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự'),
  roles: z.array(z.string().trim().max(64)).min(1, 'Chọn ít nhất một vai trò').max(10),
});

/** Accounts of the logged-in user's shop. */
@Controller('users')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('users.manage')
  async list(@CurrentUser() me: AuthUser) {
    const users = await this.prisma.client.user.findMany({
      where: { shopId: me.shopId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        lastLoginAt: true,
        roles: { select: { role: { select: { code: true, name: true } } } },
      },
    });
    return { data: users.map((u) => ({ ...u, roles: u.roles.map((r) => r.role) })) };
  }

  /** New account in the same shop as the person creating it. */
  @Post()
  @RequirePermissions('users.manage')
  async create(@CurrentUser() me: AuthUser, @Body() raw: unknown) {
    const b = parseInput(CreateUserBody, raw);
    const db = this.prisma.client;
    if (await db.user.findUnique({ where: { email: b.email } }))
      throw new ConflictException('Email đã có tài khoản');
    const roles = await db.role.findMany({ where: { code: { in: b.roles } } });
    if (roles.length !== new Set(b.roles).size) throw new ConflictException('Có vai trò không tồn tại');
    const u = await db.user.create({
      data: {
        shopId: me.shopId,
        email: b.email,
        name: b.name,
        passwordHash: await hashPassword(b.password),
        roles: { create: roles.map((r) => ({ roleId: r.id })) },
      },
      select: { id: true, email: true, name: true },
    });
    return u;
  }
}
