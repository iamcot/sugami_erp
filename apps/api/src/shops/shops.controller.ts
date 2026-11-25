import { Body, ConflictException, Controller, Get, Post } from '@nestjs/common';
import { DEFAULT_ROLES, hashPassword, runAsShop } from '@sugami/db';
import { z } from 'zod';
import { RequirePlatformAdmin } from '../auth/decorators.js';
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
      include: { _count: { select: { users: true } } },
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
        createdAt: s.createdAt.toISOString(),
      })),
    };
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
