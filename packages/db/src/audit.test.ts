import { Prisma } from './generated/prisma/client.js';
import { describe, expect, it } from 'vitest';
import { currentActor, diffRecords, runAsActor } from './audit.js';

describe('diffRecords', () => {
  it('keeps only changed fields and serialises BigInt/Decimal', () => {
    const before = {
      id: 'v1',
      price: 100000n,
      minStock: new Prisma.Decimal('2'),
      sku: 'A',
      updatedAt: new Date(0),
    };
    const after = { ...before, price: 120000n, minStock: new Prisma.Decimal('2.000'), updatedAt: new Date() };
    expect(diffRecords(before, after)).toEqual({ price: { from: '100000', to: '120000' } });
  });

  it('records every field on create/delete except ignored ones', () => {
    const row = { id: 'p1', name: 'Xe', searchKey: 'xe', costAvg: 5n, createdAt: new Date() };
    expect(diffRecords(null, row)).toEqual({ id: { from: null, to: 'p1' }, name: { from: null, to: 'Xe' } });
    expect(Object.keys(diffRecords(row, null))).toEqual(['id', 'name']);
  });

  it('compares JSON values structurally', () => {
    expect(diffRecords({ id: 1, tags: ['a'] }, { id: 1, tags: ['a'] })).toEqual({});
    expect(diffRecords({ id: 1, tags: ['a'] }, { id: 1, tags: ['a', 'b'] })).toHaveProperty('tags');
  });
});

describe('runAsActor', () => {
  it('exposes the actor across awaits', async () => {
    await runAsActor({ userId: 'u1' }, async () => {
      await new Promise((r) => setTimeout(r, 1));
      expect(currentActor()?.userId).toBe('u1');
    });
    expect(currentActor()).toBeUndefined();
  });

  it('starts lazy thenables (like Prisma queries) inside the context', async () => {
    const lazy = { then: (resolve: (v: unknown) => void) => resolve(currentActor()?.userId) };
    expect(await runAsActor({ userId: 'u2' }, () => lazy)).toBe('u2');
  });
});
