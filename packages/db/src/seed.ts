import { createPrismaClient } from './client.js';
import { hashPassword } from './password.js';
import { DEFAULT_ROLES } from './roles.js';

/**
 * Idempotent seed: upserts built-in roles, and creates the first owner account when
 * SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD are set (never overwrites an existing user).
 */
async function main(): Promise<void> {
  const prisma = createPrismaClient();
  try {
    for (const role of DEFAULT_ROLES) {
      await prisma.role.upsert({
        where: { code: role.code },
        create: { code: role.code, name: role.name, permissions: [...role.permissions] },
        update: { name: role.name, permissions: [...role.permissions] },
      });
    }
    console.log(`Seeded ${DEFAULT_ROLES.length} roles`);

    await prisma.warehouse.upsert({
      where: { code: 'KHO-CHINH' },
      create: { code: 'KHO-CHINH', name: 'Kho chính', type: 'warehouse' },
      update: {},
    });
    console.log('Seeded default warehouse KHO-CHINH');

    const channels = [
      { code: 'shopee', type: 'shopee', name: 'Shopee' },
      { code: 'tiktok', type: 'tiktok', name: 'TikTok Shop' },
      { code: 'store', type: 'store', name: 'Bán trực tiếp' },
    ] as const;
    for (const c of channels) await prisma.channel.upsert({ where: { code: c.code }, create: c, update: {} });
    console.log(`Seeded ${channels.length} sales channels`);

    const email = process.env.SEED_OWNER_EMAIL?.trim().toLowerCase();
    const password = process.env.SEED_OWNER_PASSWORD;
    if (!email || !password) {
      console.log('SEED_OWNER_EMAIL/SEED_OWNER_PASSWORD not set, no owner created');
      return;
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      console.log(`Owner ${email} already exists, skipped`);
      return;
    }
    const owner = await prisma.role.findUniqueOrThrow({ where: { code: 'owner' } });
    await prisma.user.create({
      data: {
        email,
        name: process.env.SEED_OWNER_NAME ?? 'Chủ shop',
        passwordHash: await hashPassword(password),
        roles: { create: [{ roleId: owner.id }] },
      },
    });
    console.log(`Created owner ${email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
