import type { PancakeClient, PushProductInput } from '@sugami/channels-pancake';
import { describe, expect, it } from 'vitest';
import { PancakePushError, planProductPush, pushProduct, syncProductStock } from './pancake-push.js';

const input: PushProductInput = {
  code: 'XE1',
  name: 'Xe đua mini',
  description: null,
  options: [],
  variants: [{ sku: 'XE1', barcode: null, optionValues: [], price: 150000, cost: 90000, onHand: 6 }],
};

/** In-memory Pancake: variations by custom_id with stock per warehouse. */
function fakePancake(warehouses: { id: string }[], existing: Record<string, number> = {}) {
  const variations = new Map(Object.entries(existing));
  const posts: { path: string; body: unknown }[] = [];
  const client = {
    get: async () => ({ data: warehouses }),
    paginate: async function* () {
      for (const [sku, qty] of variations)
        yield {
          id: `v-${sku}`,
          custom_id: sku,
          product_id: 'p',
          variations_warehouses: [{ warehouse_id: warehouses[0]!.id, actual_remain_quantity: qty }],
        };
    },
    post: async (path: string, raw: unknown) => {
      const body = raw as {
        product: {
          variations: { custom_id: string; variations_warehouses: { remain_quantity: number }[] }[];
        };
        variations_warehouses: { variation_id: string; remain_quantity: number }[];
      };
      posts.push({ path, body });
      if (path === '/products')
        for (const v of body.product.variations)
          variations.set(v.custom_id, v.variations_warehouses[0]!.remain_quantity);
      if (path === '/variations/update_quantity')
        for (const w of body.variations_warehouses)
          variations.set(w.variation_id.slice(2), w.remain_quantity);
      return { success: true };
    },
  } as unknown as PancakeClient;
  return { client, posts };
}

describe('Pancake push', () => {
  it('previews without writing, then creates and reads back', async () => {
    const { client, posts } = fakePancake([{ id: 'w1' }]);
    const plan = await planProductPush(client, input);
    expect(plan).toMatchObject({ warehouse: { id: 'w1' }, existing: [], missing: ['XE1'] });
    expect(posts).toHaveLength(0);

    const done = await pushProduct(client, input);
    expect(posts.map((p) => p.path)).toEqual(['/products']);
    expect(done.created).toEqual([{ sku: 'XE1', variationId: 'v-XE1', pancakeStock: 6 }]);
    expect(done.notFoundAfterCreate).toEqual([]);
  });

  it('refuses to create a product whose SKU is already on Pancake', async () => {
    const { client, posts } = fakePancake([{ id: 'w1' }], { XE1: 2 });
    await expect(pushProduct(client, input)).rejects.toMatchObject({ status: 409 });
    expect(posts).toHaveLength(0);
  });

  it('needs a warehouse choice when Pancake has several', async () => {
    const { client } = fakePancake([{ id: 'w1' }, { id: 'w2' }]);
    await expect(planProductPush(client, input)).rejects.toBeInstanceOf(PancakePushError);
    expect((await planProductPush(client, input, 'w2')).warehouse.id).toBe('w2');
  });

  it('syncs stock: preview shows the change, real run sets actual inventory and reports after', async () => {
    const { client, posts } = fakePancake([{ id: 'w1' }], { XE1: 2 });
    const preview = await syncProductStock(client, input, { dryRun: true });
    expect(preview.rows).toEqual([{ sku: 'XE1', sugami: 6, pancakeBefore: 2 }]);
    expect(posts).toHaveLength(0);

    const run = await syncProductStock(client, input, { dryRun: false });
    expect(posts[0]).toMatchObject({
      path: '/variations/update_quantity',
      body: { is_actual_remain_quantity: true },
    });
    expect(run.rows[0]).toMatchObject({ pancakeBefore: 2, pancakeAfter: 6 });
  });
});
