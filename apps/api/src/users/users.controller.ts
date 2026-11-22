import { Controller, Get } from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('users.manage')
  async list() {
    const users = await this.prisma.client.user.findMany({
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
}
