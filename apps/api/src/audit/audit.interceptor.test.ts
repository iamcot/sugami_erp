import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { currentActor } from '@sugami/db';
import { firstValueFrom, Observable } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { AuditInterceptor } from './audit.interceptor.js';

const ctxWith = (user?: { id: string }) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as unknown as ExecutionContext;

// The handler's async work (e.g. Prisma writes) must see the request user as the audit actor.
const handler: CallHandler = {
  handle: () =>
    new Observable((sub) => {
      setTimeout(() => {
        sub.next(currentActor()?.userId ?? null);
        sub.complete();
      }, 1);
    }),
};

describe('AuditInterceptor', () => {
  it('runs the handler with the logged-in user as actor', async () => {
    const out = new AuditInterceptor().intercept(ctxWith({ id: 'u-42' }), handler);
    expect(await firstValueFrom(out)).toBe('u-42');
  });

  it('has no actor for anonymous requests', async () => {
    expect(await firstValueFrom(new AuditInterceptor().intercept(ctxWith(), handler))).toBeNull();
  });
});
