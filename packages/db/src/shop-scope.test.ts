import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  currentShopId,
  DEFAULT_SHOP_ID,
  NESTED_SHOP_RELATIONS,
  runAsShop,
  scopeWhere,
  SHOP_MODELS,
  SHOP_VIA,
  stampShop,
} from './shop-scope.js';

const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const models = new Map<string, string>();
for (const m of schema.matchAll(/^model (\w+) \{\n([\s\S]*?)\n\}/gm)) models.set(m[1]!, m[2]!);

describe('shop scope', () => {
  it('defaults to Sugami and follows runAsShop', async () => {
    expect(currentShopId()).toBe(DEFAULT_SHOP_ID);
    await runAsShop('shop-b', async () => {
      await Promise.resolve();
      expect(currentShopId()).toBe('shop-b');
    });
    expect(currentShopId()).toBe(DEFAULT_SHOP_ID);
  });

  it('every model with a shop_id column is scoped, and no other', () => {
    const withColumn = [...models].filter(([, body]) => /^\s+shopId\s/m.test(body)).map(([name]) => name);
    expect(withColumn.filter((m) => m !== 'User').sort()).toEqual([...SHOP_MODELS].sort());
  });

  it('every model without the column is either scoped through a parent or knowingly global', () => {
    const global = [
      'Shop',
      'User',
      'Session',
      'Role',
      'UserRole',
      'AuditLog',
      'ExternalRef',
      'WebhookEvent',
      'PushSubscription',
      'SyncCursor',
      'ProductOptionValue',
    ];
    const rest = [...models.keys()].filter((m) => !SHOP_MODELS.has(m) && !SHOP_VIA[m]);
    expect(rest.sort()).toEqual(global.sort());
  });

  it('knows every relation that points at a shop model, so nested creates get shop_id', () => {
    for (const [model, body] of models) {
      for (const f of body.matchAll(/^\s+(\w+)\s+(\w+)(\[\]|\?)?\s/gm)) {
        const [, field, type] = f;
        if (!SHOP_MODELS.has(type!)) continue;
        expect(NESTED_SHOP_RELATIONS[model]?.[field!], `${model}.${field}`).toBe(type);
      }
    }
  });

  it('stamps creates, nested ones included', () => {
    const data: Record<string, unknown> = {
      code: 'P1',
      variants: { create: [{ sku: 'A' }, { sku: 'B', shopId: 'kept' }] },
      options: { create: [{ name: 'Màu' }] },
    };
    stampShop('Product', data, 'shop-b');
    expect(data).toMatchObject({
      shopId: 'shop-b',
      variants: {
        create: [
          { sku: 'A', shopId: 'shop-b' },
          { sku: 'B', shopId: 'kept' },
        ],
      },
      options: { create: [{ name: 'Màu' }] },
    });
    expect((data.options as { create: object[] }).create[0]).not.toHaveProperty('shopId');
    const line = { variantId: 'v', order: { create: { code: 'X' } } };
    stampShop('OrderLine', line, 'shop-b');
    expect(line.order.create).toMatchObject({ shopId: 'shop-b' });
  });

  it('adds the filter to where without dropping the caller’s own', () => {
    expect(scopeWhere('Product', { code: 'P1' }, 's')).toEqual({ code: 'P1', shopId: 's' });
    expect(scopeWhere('OrderLine', { order: { source: 'pos' } }, 's')).toEqual({
      order: { source: 'pos' },
      AND: [{ order: { shopId: 's' } }],
    });
    expect(scopeWhere('StockLevel', { AND: { onHand: { gt: 0 } } }, 's')).toEqual({
      AND: [{ onHand: { gt: 0 } }, { variant: { shopId: 's' } }],
    });
    expect(scopeWhere('Session', { id: 'x' }, 's')).toEqual({ id: 'x' });
  });
});
