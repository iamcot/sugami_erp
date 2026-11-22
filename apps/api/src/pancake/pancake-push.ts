import {
  buildCreateProductBody,
  createProduct,
  findVariationsBySku,
  listWarehouses,
  type PancakeClient,
  type PancakeWarehouse,
  type PushProductInput,
  setStock,
} from '@sugami/channels-pancake';

export class PancakePushError extends Error {
  constructor(
    message: string,
    readonly status: 409 | 422,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export interface PushPlan {
  warehouse: PancakeWarehouse;
  warehouses: PancakeWarehouse[];
  /** SKUs already on Pancake: product creation is refused to avoid duplicates. */
  existing: { sku: string; variationId: string; pancakeStock: number | null }[];
  missing: string[];
  /** What would be sent (no api key). */
  body: ReturnType<typeof buildCreateProductBody>;
}

async function resolveWarehouse(client: PancakeClient, hint: string | undefined) {
  const warehouses = await listWarehouses(client);
  const wanted = hint ?? process.env.PANCAKE_WAREHOUSE_ID;
  const warehouse = wanted
    ? warehouses.find((w) => w.id === wanted)
    : warehouses.length === 1
      ? warehouses[0]
      : undefined;
  if (!warehouse) {
    throw new PancakePushError(
      wanted
        ? 'Không thấy kho này trên Pancake'
        : 'Pancake có nhiều kho: chọn kho nhận hàng (hoặc đặt PANCAKE_WAREHOUSE_ID)',
      422,
      { warehouses },
    );
  }
  return { warehouse, warehouses };
}

const stockOf = (
  v: { variations_warehouses?: { warehouse_id: string; actual_remain_quantity?: number | null }[] | null },
  wh: string,
) => v.variations_warehouses?.find((w) => w.warehouse_id === wh)?.actual_remain_quantity ?? null;

export async function planProductPush(
  client: PancakeClient,
  input: PushProductInput,
  warehouseHint?: string,
): Promise<PushPlan> {
  const { warehouse, warehouses } = await resolveWarehouse(client, warehouseHint);
  const found = await findVariationsBySku(
    client,
    input.variants.map((v) => v.sku),
  );
  return {
    warehouse,
    warehouses,
    existing: [...found].map(([sku, v]) => ({
      sku,
      variationId: v.id,
      pancakeStock: stockOf(v, warehouse.id),
    })),
    missing: input.variants.map((v) => v.sku).filter((s) => !found.has(s)),
    body: buildCreateProductBody(input, warehouse.id),
  };
}

/** Create the product on Pancake unless any of its SKUs is already there; then read it back. */
export async function pushProduct(client: PancakeClient, input: PushProductInput, warehouseHint?: string) {
  const plan = await planProductPush(client, input, warehouseHint);
  if (plan.existing.length) {
    throw new PancakePushError(
      `Đã có ${plan.existing.length} mã trên Pancake (${plan.existing.map((e) => e.sku).join(', ')}). Dùng "Đồng bộ tồn" thay vì tạo lại.`,
      409,
    );
  }
  await createProduct(client, input, plan.warehouse.id);
  // Pancake's reply carries no ids, so confirm by reading the SKUs back.
  const after = await findVariationsBySku(
    client,
    input.variants.map((v) => v.sku),
  );
  return {
    warehouse: plan.warehouse,
    created: [...after].map(([sku, v]) => ({
      sku,
      variationId: v.id,
      pancakeStock: stockOf(v, plan.warehouse.id),
    })),
    notFoundAfterCreate: input.variants.map((v) => v.sku).filter((s) => !after.has(s)),
  };
}

export interface StockSyncRow {
  sku: string;
  sugami: number;
  pancakeBefore: number | null;
  pancakeAfter?: number | null;
}

/** Set Pancake's real stock of each SKU already on Pancake to Sugami's number. */
export async function syncProductStock(
  client: PancakeClient,
  input: PushProductInput,
  opts: { dryRun: boolean; warehouseId?: string },
) {
  const { warehouse } = await resolveWarehouse(client, opts.warehouseId);
  const skus = input.variants.map((v) => v.sku);
  const found = await findVariationsBySku(client, skus);
  const rows: StockSyncRow[] = input.variants
    .filter((v) => found.has(v.sku))
    .map((v) => ({ sku: v.sku, sugami: v.onHand, pancakeBefore: stockOf(found.get(v.sku)!, warehouse.id) }));
  const missing = skus.filter((s) => !found.has(s));
  if (!opts.dryRun) {
    for (const r of rows) await setStock(client, found.get(r.sku)!.id, warehouse.id, r.sugami);
    const after = await findVariationsBySku(
      client,
      rows.map((r) => r.sku),
    );
    for (const r of rows) r.pancakeAfter = after.has(r.sku) ? stockOf(after.get(r.sku)!, warehouse.id) : null;
  }
  return { dryRun: opts.dryRun, warehouse, rows, missing };
}
