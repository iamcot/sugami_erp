import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { createPrismaClient, DEFAULT_ROLES, hashPassword, type PrismaClient } from '@sugami/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../test/app.js';

describe.skipIf(!process.env.DATABASE_URL)('auth (MySQL)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const run = randomUUID().slice(0, 8);
  const owner = { email: `owner-${run}@test.local`, password: 'owner-pass-123' };
  const staff = { email: `kho-${run}@test.local`, password: 'staff-pass-123' };

  const http = () => request(app.getHttpServer());
  const cookieOf = (res: request.Response) => {
    const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
    return (raw ?? []).map((c) => c.split(';')[0]!).join('; ');
  };

  beforeAll(async () => {
    prisma = createPrismaClient();
    for (const r of DEFAULT_ROLES) {
      await prisma.role.upsert({
        where: { code: r.code },
        create: { code: r.code, name: r.name, permissions: [...r.permissions] },
        update: {},
      });
    }
    const roles = Object.fromEntries((await prisma.role.findMany()).map((r) => [r.code, r.id]));
    for (const [u, role] of [
      [owner, 'owner'],
      [staff, 'warehouse'],
    ] as const) {
      await prisma.user.create({
        data: {
          email: u.email,
          name: role,
          passwordHash: await hashPassword(u.password),
          roles: { create: [{ roleId: roles[role]! }] },
        },
      });
    }
    app = await createTestApp();
  });

  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email: { in: [owner.email, staff.email] } } });
    await prisma?.$disconnect();
    await app?.close();
  });

  it('rejects anonymous requests', async () => {
    await http().get('/api/auth/me').expect(401);
  });

  it('rejects a wrong password with a generic message', async () => {
    const res = await http()
      .post('/api/auth/login')
      .send({ email: owner.email, password: 'nope' })
      .expect(401);
    expect(res.body.message).toBe('Email hoặc mật khẩu không đúng');
    await http().post('/api/auth/login').send({ email: 'ghost@test.local', password: 'nope' }).expect(401);
  });

  it('logs in with an httpOnly cookie, serves /me, and logs out', async () => {
    const login = await http()
      .post('/api/auth/login')
      .send({ email: owner.email.toUpperCase(), password: owner.password })
      .expect(200);
    const setCookie = (login.headers['set-cookie'] as unknown as string[])[0]!;
    expect(setCookie).toMatch(/sugami_session=.+HttpOnly/i);
    expect(login.body.user).toMatchObject({ email: owner.email, roles: ['owner'], permissions: ['*'] });
    expect(login.body.user.sessionId).toBeUndefined();

    const cookie = cookieOf(login);
    await http().get('/api/auth/me').set('Cookie', cookie).expect(200);
    await http().post('/api/auth/logout').set('Cookie', cookie).expect(204);
    await http().get('/api/auth/me').set('Cookie', cookie).expect(401);
  });

  it('enforces permissions per role', async () => {
    const ownerCookie = cookieOf(await http().post('/api/auth/login').send(owner).expect(200));
    const staffCookie = cookieOf(await http().post('/api/auth/login').send(staff).expect(200));
    const list = await http().get('/api/users').set('Cookie', ownerCookie).expect(200);
    expect(list.body.data.some((u: { email: string }) => u.email === staff.email)).toBe(true);
    const denied = await http().get('/api/users').set('Cookie', staffCookie).expect(403);
    expect(denied.body.message).toContain('users.manage');
  });

  it('changes password and signs out other sessions', async () => {
    const a = cookieOf(await http().post('/api/auth/login').send(staff).expect(200));
    const b = cookieOf(await http().post('/api/auth/login').send(staff).expect(200));
    await http()
      .post('/api/auth/change-password')
      .set('Cookie', a)
      .send({ currentPassword: 'wrong', newPassword: 'staff-pass-456' })
      .expect(401);
    await http()
      .post('/api/auth/change-password')
      .set('Cookie', a)
      .send({ currentPassword: staff.password, newPassword: 'staff-pass-456' })
      .expect(204);
    await http().get('/api/auth/me').set('Cookie', a).expect(200);
    await http().get('/api/auth/me').set('Cookie', b).expect(401);
    staff.password = 'staff-pass-456';
  });

  it('locks the account after 5 failed logins', async () => {
    for (let i = 0; i < 5; i++) {
      await http().post('/api/auth/login').send({ email: staff.email, password: 'bad' }).expect(401);
    }
    await http().post('/api/auth/login').send(staff).expect(423);
  });
});
