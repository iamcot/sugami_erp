import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { DEFAULT_ROLES, hashPassword, runAsShop } from '@sugami/db';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser, RequirePlatformAdmin } from '../auth/decorators.js';
import { parseInput } from '../common/validation.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const SHOP_TYPES = ['retail', 'assembly'] as const;

const CreateShopBody = z.object({
  name: z.string().trim().min(1, 'Nhập tên shop').max(191),
  /** Short code, lowercase letters, digits and dashes. */
  code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{2,32}$/, 'Mã shop 2–32 ký tự: chữ thường, số, dấu gạch ngang'),
  type: z.enum(SHOP_TYPES),
  owner: z.object({
    name: z.string().trim().min(1, 'Nhập tên chủ shop').max(191),
    email: z.string().trim().toLowerCase().email('Email không hợp lệ'),
    password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự'),
  }),
});

const UpdateShopBody = z.object({
  name: z.string().trim().min(1, 'Nhập tên shop').max(191).optional(),
  type: z.enum(SHOP_TYPES).optional(),
  isActive: z.boolean().optional(),
});

const UpdateAccountBody = z.object({
  name: z.string().trim().min(1, 'Nhập tên').max(191).optional(),
  email: z.string().trim().toLowerCase().email('Email không hợp lệ').optional(),
  /** Set to reset the password; every session of the account is closed. */
  password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự').optional(),
  isActive: z.boolean().optional(),
});

/**
 * Shops (tenants). Only the platform operator creates them; each new shop gets its owner account, a main
 * warehouse and the counter-sales channel, so its owner can log in and start right away.
 */
@Controller('shops')
@RequirePlatformAdmin()
export class ShopsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list() {
    const shops = await this.prisma.client.shop.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        _count: { select: { users: true } },
        users: {
          where: { roles: { some: { role: { code: 'owner' } } } },
          orderBy: { createdAt: 'asc' },
          select: { id: true, name: true, email: true, isActive: true },
        },
      },
    });
    return {
      data: shops.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        type: s.type,
        isActive: s.isActive,
        integrations: s.integrations,
        users: s._count.users,
        owners: s.users,
        createdAt: s.createdAt.toISOString(),
      })),
    };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() raw: unknown, @CurrentUser() me: AuthUser) {
    const b = parseInput(UpdateShopBody, raw);
    const db = this.prisma.client;
    const shop = await db.shop.findUnique({ where: { id } });
    if (!shop) throw new NotFoundException('Không có shop này');
    if (b.isActive === false && shop.id === me.shopId)
      throw new BadRequestException('Không thể tạm khóa shop của chính bạn');
    const updated = await db.shop.update({ where: { id }, data: b });
    if (b.isActive === false) await db.session.deleteMany({ where: { user: { shopId: id } } });
    return { id: updated.id, code: updated.code, name: updated.name, type: updated.type };
  }

  /** Edit one account of a shop (typically its owner): name, email, password reset, lock. */
  @Patch(':id/users/:userId')
  async updateAccount(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() raw: unknown,
    @CurrentUser() me: AuthUser,
  ) {
    const b = parseInput(UpdateAccountBody, raw);
    const db = this.prisma.client;
    const user = await db.user.findFirst({ where: { id: userId, shopId: id } });
    if (!user) throw new NotFoundException('Không có tài khoản này trong shop');
    if (b.isActive === false && user.id === me.id)
      throw new BadRequestException('Không thể khóa tài khoản của chính bạn');
    if (b.email && b.email !== user.email && (await db.user.findUnique({ where: { email: b.email } })))
      throw new ConflictException('Email đã có tài khoản');
    const { password, ...rest } = b;
    await db.user.update({
      where: { id: user.id },
      data: {
        ...rest,
        ...(password
          ? { passwordHash: await hashPassword(password), failedLoginCount: 0, lockedUntil: null }
          : {}),
      },
    });
    if (password || b.isActive === false) await db.session.deleteMany({ where: { userId: user.id } });
    return { ok: true };
  }

  @Post()
  async create(@Body() raw: unknown) {
    const b = parseInput(CreateShopBody, raw);
    const db = this.prisma.client;
    if (await db.shop.findUnique({ where: { code: b.code } })) throw new ConflictException('Mã shop đã có');
    if (await db.user.findUnique({ where: { email: b.owner.email } }))
      throw new ConflictException('Email đã có tài khoản');
    const ownerRole = await db.role.upsert({
      where: { code: 'owner' },
      create: { code: 'owner', name: DEFAULT_ROLES[0].name, permissions: [...DEFAULT_ROLES[0].permissions] },
      update: {},
    });
    const passwordHash = await hashPassword(b.owner.password);
    const shop = await db.shop.create({ data: { code: b.code, name: b.name, type: b.type } });
    // Everything below belongs to the new shop.
    await runAsShop(shop.id, () =>
      db.$transaction(async (tx) => {
        await tx.user.create({
          data: {
            shopId: shop.id,
            email: b.owner.email,
            name: b.owner.name,
            passwordHash,
            roles: { create: [{ roleId: ownerRole.id }] },
          },
        });
        await tx.warehouse.create({ data: { code: 'KHO-CHINH', name: 'Kho chính', type: 'store' } });
        await tx.channel.create({ data: { code: 'store', type: 'store', name: 'Bán trực tiếp' } });
      }),
    );
    return { id: shop.id, code: shop.code, name: shop.name, type: shop.type };
  }
}
