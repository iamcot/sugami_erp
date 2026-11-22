import {
  type ImportIssue,
  isFeeGroup,
  type KvProductGroup,
  type ParsedProductList,
} from '@sugami/channels-kiotviet';
import { applyMovements, type MovementInput, Prisma, type PrismaClient, withLedgerTx } from '@sugami/db';
import { slugify, toSearchKey } from '@sugami/shared';

export interface ImportOptions {
  warehouseId: string;
  /** Compute the summary only; write nothing. */
  dryRun: boolean;
  userId?: string;
}

export interface StockDiff {
  sku: string;
  sugami: number;
  kiotviet: number;
}

export interface ProductImportSummary {
  dryRun: boolean;
  rows: number;
  categories: { created: number };
  products: { created: number; updated: number; unchanged: number };
  variants: { created: number; updated: number; unchanged: number };
  /** Opening stock written for SKUs that had no stock history in Sugami yet. */
  openingStock: { skus: number; units: number };
  /** SKUs that already have stock history and whose Sugami stock differs from KiotViet: not changed (see P1-15). */
  stockDiffs: StockDiff[];
  issues: ImportIssue[];
}

const D = (v: Prisma.Decimal | number | string) => new Prisma.Decimal(v);
const STOCK_CHUNK = 50;

/**
 * Import a parsed KiotViet product list. Idempotent: products/variants are matched by code/SKU,
 * running the same file twice changes nothing. Stock is written only as opening balance for SKUs
 * without stock history; later differences are reported, never overwritten.
 */
export async function importKiotVietProducts(
  db: PrismaClient,
  parsed: ParsedProductList,
  opts: ImportOptions,
): Promise<ProductImportSummary> {
  const issues = [...parsed.issues];
  const summary: ProductImportSummary = {
    dryRun: opts.dryRun,
    rows: parsed.rowCount,
    categories: { created: 0 },
    products: { created: 0, updated: 0, unchanged: 0 },
    variants: { created: 0, updated: 0, unchanged: 0 },
    openingStock: { skus: 0, units: 0 },
    stockDiffs: [],
    issues,
  };
  if (issues.some((i) => i.level === 'error')) {
    // Row errors are shown in the preview; refuse to write a half-valid file.
    if (!opts.dryRun) throw new ImportBlockedError(issues.filter((i) => i.level === 'error'));
  }
  const groups = parsed.groups;
  const skus = groups.flatMap((g) => g.variants.map((v) => v.sku));

  // ---- Load current state ----
  const [products, variants, categories, brands, levels, movedRows] = await Promise.all([
    db.product.findMany({ where: { code: { in: groups.map((g) => g.code) } } }),
    db.variant.findMany({ where: { sku: { in: skus } } }),
    db.category.findMany(),
    db.brand.findMany(),
    db.stockLevel.findMany({
      where: { warehouseId: opts.warehouseId, variant: { sku: { in: skus } } },
      include: { variant: { select: { sku: true } } },
    }),
    db.stockMovement.groupBy({
      by: ['variantId'],
      where: { warehouseId: opts.warehouseId, variant: { sku: { in: skus } } },
    }),
  ]);
  const productByCode = new Map(products.map((p) => [p.code, p]));
  const variantBySku = new Map(variants.map((v) => [v.sku, v]));
  const levelBySku = new Map(levels.map((l) => [l.variant.sku, l]));
  const hasHistory = new Set(movedRows.map((m) => m.variantId));
  const barcodeOwner = new Map(
    (
      await db.variant.findMany({ where: { barcode: { not: null } }, select: { sku: true, barcode: true } })
    ).map((v) => [v.barcode!, v.sku]),
  );

  // ---- Categories (path "A >> B" → nested) and brands ----
  const catKey = (parentId: string | null, name: string) => `${parentId ?? ''}/${name.toLowerCase()}`;
  const catByKey = new Map(categories.map((c) => [catKey(c.parentId, c.name), c.id]));
  const brandByName = new Map(brands.map((b) => [b.name.toLowerCase(), b.id]));
  const ensureCategory = async (path: string[]): Promise<string | null> => {
    let parentId: string | null = null;
    for (let i = 0; i < path.length; i++) {
      const name = path[i]!;
      const key = catKey(parentId, name);
      let id = catByKey.get(key);
      if (!id) {
        summary.categories.created++;
        id = opts.dryRun
          ? `dry:${key}`
          : (
              await db.category.create({
                data: {
                  name,
                  parentId,
                  slug: slugify(path.slice(0, i + 1).join(' ')) || `nhom-${Date.now()}`,
                },
              })
            ).id;
        catByKey.set(key, id);
      }
      parentId = id;
    }
    return parentId;
  };
  const ensureBrand = async (name: string | null): Promise<string | null> => {
    if (!name) return null;
    let id = brandByName.get(name.toLowerCase());
    if (!id) {
      id = opts.dryRun ? `dry:${name}` : (await db.brand.create({ data: { name } })).id;
      brandByName.set(name.toLowerCase(), id);
    }
    return id;
  };

  const openings: (MovementInput & { sku: string; cost: number })[] = [];

  for (const g of groups) {
    const categoryId = await ensureCategory(g.categoryPath);
    const brandId = await ensureBrand(g.brand);
    const productData = {
      name: g.name,
      searchKey: toSearchKey(g.name).slice(0, 255),
      categoryId,
      brandId,
      description: g.description,
      ...(isFeeGroup(g) ? { status: 'archived' as const } : {}),
    };
    let product = productByCode.get(g.code);
    if (!product) {
      summary.products.created++;
      if (!opts.dryRun) {
        product = await db.product.create({
          data: { code: g.code, ...productData, status: isFeeGroup(g) ? 'archived' : 'active' },
        });
      }
    } else {
      const changed =
        product.name !== productData.name ||
        product.categoryId !== categoryId ||
        product.brandId !== brandId ||
        (product.description ?? null) !== productData.description ||
        (isFeeGroup(g) && product.status !== 'archived');
      if (changed) {
        summary.products.updated++;
        if (!opts.dryRun) product = await db.product.update({ where: { id: product.id }, data: productData });
      } else summary.products.unchanged++;
    }
    const productId = product?.id ?? `dry:${g.code}`;
    if (!opts.dryRun) await syncOptions(db, productId, g);

    for (const v of g.variants) {
      let barcode = v.barcode;
      const owner = barcode ? barcodeOwner.get(barcode) : undefined;
      if (barcode && owner && owner !== v.sku) {
        issues.push({
          row: v.row,
          sku: v.sku,
          level: 'warning',
          message: `Mã vạch ${barcode} đã dùng cho ${owner}, bỏ mã vạch`,
        });
        barcode = null;
      }
      const data = {
        productId,
        optionValues: v.optionValues,
        price: BigInt(v.price),
        barcode,
        weightGrams: v.weightGrams,
        minStock: D(v.minStock),
        status: v.active ? ('active' as const) : ('inactive' as const),
      };
      const existing = variantBySku.get(v.sku);
      let variantId = existing?.id;
      if (!existing) {
        summary.variants.created++;
        if (!opts.dryRun) {
          variantId = (await db.variant.create({ data: { sku: v.sku, ...data, costAvg: BigInt(v.cost) } }))
            .id;
        }
      } else {
        const changed =
          existing.productId !== productId ||
          JSON.stringify(existing.optionValues) !== JSON.stringify(v.optionValues) ||
          existing.price !== data.price ||
          existing.barcode !== barcode ||
          existing.weightGrams !== data.weightGrams ||
          !existing.minStock.equals(data.minStock) ||
          existing.status !== data.status;
        if (changed) {
          summary.variants.updated++;
          if (!opts.dryRun) await db.variant.update({ where: { id: existing.id }, data });
        } else summary.variants.unchanged++;
      }
      if (barcode) barcodeOwner.set(barcode, v.sku);

      // ---- Stock ----
      const current = Number(levelBySku.get(v.sku)?.onHand ?? 0);
      const fresh = !existing || !hasHistory.has(existing.id);
      if (fresh) {
        if (v.onHand !== 0) {
          summary.openingStock.skus++;
          summary.openingStock.units += v.onHand;
          openings.push({
            sku: v.sku,
            cost: v.cost,
            warehouseId: opts.warehouseId,
            variantId: variantId ?? `dry:${v.sku}`,
            qtyDelta: v.onHand,
            type: 'kiotviet_import',
            unitCost: v.onHand > 0 ? v.cost : undefined,
            refType: 'kiotviet_products',
            note: 'Tồn đầu kỳ từ file KiotViet',
            createdBy: opts.userId,
          });
        }
      } else if (current !== v.onHand) {
        summary.stockDiffs.push({ sku: v.sku, sugami: current, kiotviet: v.onHand });
      }
    }
  }

  if (!opts.dryRun) {
    for (let i = 0; i < openings.length; i += STOCK_CHUNK) {
      const chunk = openings.slice(i, i + STOCK_CHUNK);
      await withLedgerTx(db, async (tx) => {
        await applyMovements(
          tx,
          chunk.map(({ sku: _sku, cost: _cost, ...m }) => m),
        );
        // KiotViet's cost is the opening average cost (also for negative/zero openings).
        for (const o of chunk)
          await tx.variant.update({ where: { id: o.variantId }, data: { costAvg: BigInt(o.cost) } });
      });
    }
  }
  issues.sort((a, b) => a.row - b.row);
  return summary;
}

/** Replace the product's option names/values with the group's when they differ. */
async function syncOptions(db: PrismaClient, productId: string, g: KvProductGroup): Promise<void> {
  const want = g.optionNames.map((name, i) => ({
    name,
    values: [...new Set(g.variants.map((v) => v.optionValues[i]!).filter(Boolean))],
  }));
  const have = await db.productOption.findMany({
    where: { productId },
    orderBy: { sort: 'asc' },
    include: { values: { orderBy: { sort: 'asc' } } },
  });
  const same =
    have.length === want.length &&
    have.every(
      (o, i) =>
        o.name === want[i]!.name &&
        JSON.stringify(o.values.map((v) => v.value)) === JSON.stringify(want[i]!.values),
    );
  if (same) return;
  await db.$transaction([
    db.productOption.deleteMany({ where: { productId } }),
    ...want.map((o, i) =>
      db.productOption.create({
        data: {
          productId,
          name: o.name,
          sort: i,
          values: { create: o.values.map((value, j) => ({ value, sort: j })) },
        },
      }),
    ),
  ]);
}

export class ImportBlockedError extends Error {
  constructor(readonly errors: ImportIssue[]) {
    super(`File có ${errors.length} dòng lỗi, sửa trên KiotViet rồi xuất lại`);
    this.name = 'ImportBlockedError';
  }
}
