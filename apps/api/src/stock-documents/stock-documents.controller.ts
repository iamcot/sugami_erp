import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Header,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { productTemplateFile, purchaseOrderFile, stockTakeFile } from '@sugami/channels-kiotviet';
import { cancelStockDocument, confirmStockDocument, Prisma, StockDocumentError } from '@sugami/db';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser, RequirePermissions } from '../auth/decorators.js';
import { parseInput } from '../common/validation.js';
import { PrismaService } from '../prisma/prisma.service.js';

const TYPES = ['receipt', 'count'] as const;
const PREFIX: Record<(typeof TYPES)[number], string> = { receipt: 'NH', count: 'KK' };

const Line = z.object({
  sku: z.string().trim().min(1).max(64),
  quantity: z.number().min(0).max(1_000_000),
  unitCost: z.number().int().min(0).max(10_000_000_000).optional(),
});
const Input = z.object({
  type: z.enum(TYPES),
  warehouseCode: z.string().max(32).optional(),
  reason: z.string().trim().max(255).optional(),
  lines: z.array(Line).min(1, 'Phiếu chưa có dòng nào').max(2000),
  confirm: z.boolean().default(false),
});
const Update = Input.omit({ type: true, warehouseCode: true });
const ListQuery = z.object({
  type: z.enum(TYPES).optional(),
  status: z.enum(['draft', 'confirmed', 'cancelled']).optional(),
  notExported: z.enum(['1', '0']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

const n = (v: unknown) => Number(v ?? 0);
const vnDate = (d: Date) =>
  new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(2, 10).replace(/-/g, '');
const xlsx = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Stock documents made in Sugami (goods received, stock counts) and their KiotViet import files.
 * Receipt lines carry the landed unit cost; count lines carry the counted quantity.
 */
@Controller()
export class StockDocumentsController {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  @Get('stock-documents')
  @RequirePermissions('inventory.read')
  async list(@Query() raw: unknown) {
    const q = parseInput(ListQuery, raw);
    const where: Prisma.StockDocumentWhereInput = {
      type: q.type ? q.type : { in: [...TYPES] },
      ...(q.status ? { status: q.status } : {}),
      ...(q.notExported === '1' ? { status: 'confirmed', exportedToKiotvietAt: null } : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.stockDocument.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          warehouse: { select: { code: true, name: true } },
          lines: { select: { quantity: true, unitCost: true } },
        },
      }),
      this.db.stockDocument.count({ where }),
    ]);
    return {
      data: rows.map((d) => ({
        code: d.code,
        type: d.type,
        status: d.status,
        reason: d.reason,
        warehouse: d.warehouse,
        lineCount: d.lines.length,
        units: d.lines.reduce((a, l) => a + n(l.quantity), 0),
        value: d.type === 'receipt' ? d.lines.reduce((a, l) => a + n(l.quantity) * n(l.unitCost), 0) : null,
        createdAt: d.createdAt,
        confirmedAt: d.confirmedAt,
        exportedToKiotvietAt: d.exportedToKiotvietAt,
      })),
      total,
    };
  }

  @Get('stock-documents/:code')
  @RequirePermissions('inventory.read')
  async get(@Param('code') code: string) {
    const d = await this.load(code);
    const levels = await this.db.stockLevel.findMany({
      where: { warehouseId: d.warehouseId, variantId: { in: d.lines.map((l) => l.variantId) } },
      select: { variantId: true, onHand: true },
    });
    const onHand = new Map(levels.map((l) => [l.variantId, n(l.onHand)]));
    const missing = await this.notInKiotviet(d.lines.map((l) => l.variantId));
    return {
      document: {
        code: d.code,
        type: d.type,
        status: d.status,
        reason: d.reason,
        warehouse: { code: d.warehouse.code, name: d.warehouse.name },
        createdAt: d.createdAt,
        confirmedAt: d.confirmedAt,
        cancelledAt: d.cancelledAt,
        exportedToKiotvietAt: d.exportedToKiotvietAt,
        lines: d.lines.map((l) => ({
          sku: l.variant.sku,
          name: l.variant.product.name,
          optionValues: l.variant.optionValues,
          quantity: n(l.quantity),
          unitCost: l.unitCost === null ? null : n(l.unitCost),
          onHand: onHand.get(l.variantId) ?? 0,
          inKiotviet: !missing.has(l.variantId),
        })),
      },
      kiotviet: { missingSkus: d.lines.filter((l) => missing.has(l.variantId)).map((l) => l.variant.sku) },
    };
  }

  @Post('stock-documents')
  @RequirePermissions('inventory.write')
  async create(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    const input = parseInput(Input, body);
    const warehouse = await this.db.warehouse.findUnique({
      where: { code: input.warehouseCode ?? 'KHO-CHINH' },
    });
    if (!warehouse || !warehouse.isActive) throw new BadRequestException('Không tìm thấy kho');
    const lines = await this.resolveLines(input.type, input.lines);
    const code = await this.nextCode(input.type);
    await this.db.stockDocument.create({
      data: {
        code,
        type: input.type,
        warehouseId: warehouse.id,
        reason: input.reason || null,
        createdBy: user.id,
        lines: { create: lines },
      },
    });
    if (input.confirm) await this.confirm(code, user);
    return this.get(code);
  }

  @Put('stock-documents/:code')
  @RequirePermissions('inventory.write')
  async update(@Param('code') code: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    const input = parseInput(Update, body);
    const d = await this.load(code);
    if (d.status !== 'draft') throw new ConflictException('Chỉ sửa được phiếu nháp');
    const lines = await this.resolveLines(d.type as (typeof TYPES)[number], input.lines);
    await this.db.$transaction([
      this.db.stockDocumentLine.deleteMany({ where: { documentId: d.id } }),
      this.db.stockDocument.update({
        where: { id: d.id },
        data: { reason: input.reason || null, lines: { create: lines } },
      }),
    ]);
    if (input.confirm) await this.confirm(code, user);
    return this.get(code);
  }

  @Post('stock-documents/:code/confirm')
  @HttpCode(200)
  @RequirePermissions('inventory.write')
  async confirm(@Param('code') code: string, @CurrentUser() user: AuthUser) {
    const d = await this.load(code);
    await this.wrap(() => confirmStockDocument(this.db, d.id, user.id));
    return this.get(code);
  }

  @Post('stock-documents/:code/cancel')
  @HttpCode(200)
  @RequirePermissions('inventory.write')
  async cancel(@Param('code') code: string, @CurrentUser() user: AuthUser) {
    const d = await this.load(code);
    await this.wrap(() => cancelStockDocument(this.db, d.id, user.id));
    return this.get(code);
  }

  /** KiotViet import file for a confirmed document; the first download marks it exported. */
  @Get('stock-documents/:code/kiotviet.xlsx')
  @RequirePermissions('inventory.read')
  @Header('Content-Type', xlsx)
  async exportFile(@Param('code') code: string) {
    const d = await this.load(code);
    if (d.status !== 'confirmed') throw new ConflictException('Chỉ xuất được phiếu đã xác nhận');
    const file =
      d.type === 'receipt'
        ? await purchaseOrderFile(
            d.lines.map((l) => ({
              sku: l.variant.sku,
              name: l.variant.product.name,
              unitCost: n(l.unitCost),
              quantity: n(l.quantity),
            })),
          )
        : await stockTakeFile(d.lines.map((l) => ({ sku: l.variant.sku, quantity: n(l.quantity) })));
    if (!d.exportedToKiotvietAt)
      await this.db.stockDocument.update({ where: { id: d.id }, data: { exportedToKiotvietAt: new Date() } });
    const name = `${d.type === 'receipt' ? 'NhapHang' : 'KiemKho'}_${d.code}.xlsx`;
    return new StreamableFile(file, { disposition: `attachment; filename="${name}"`, type: xlsx });
  }

  /** Active SKUs KiotViet does not have yet (never seen in a KiotViet product file). */
  @Get('exports/kiotviet/new-products')
  @RequirePermissions('catalog.read')
  async newProducts() {
    const rows = await this.newProductRows();
    return {
      total: rows.length,
      data: rows.map((r) => ({
        sku: r.sku,
        name: r.name,
        price: r.price,
        cost: r.cost,
        parentSku: r.parentSku ?? null,
      })),
    };
  }

  @Get('exports/kiotviet/new-products.xlsx')
  @RequirePermissions('catalog.read')
  @Header('Content-Type', xlsx)
  async newProductsFile() {
    const rows = await this.newProductRows();
    if (rows.length === 0) throw new NotFoundException('Không có sản phẩm mới cần đưa sang KiotViet');
    const stamp = vnDate(new Date());
    return new StreamableFile(await productTemplateFile(rows), {
      disposition: `attachment; filename="SanPhamMoi_${stamp}.xlsx"`,
      type: xlsx,
    });
  }

  // ---- helpers ----

  private async load(code: string) {
    const d = await this.db.stockDocument.findUnique({
      where: { code },
      include: {
        warehouse: true,
        lines: {
          orderBy: { id: 'asc' },
          include: { variant: { include: { product: { select: { name: true } } } } },
        },
      },
    });
    if (!d || !(TYPES as readonly string[]).includes(d.type))
      throw new NotFoundException(`Không có phiếu ${code}`);
    return d;
  }

  private async wrap(fn: () => Promise<void>) {
    try {
      await fn();
    } catch (err) {
      if (err instanceof StockDocumentError) throw new ConflictException(err.message);
      throw err;
    }
  }

  private async resolveLines(type: (typeof TYPES)[number], lines: z.infer<typeof Line>[]) {
    const skus = [...new Set(lines.map((l) => l.sku))];
    const variants = await this.db.variant.findMany({
      where: { sku: { in: skus } },
      select: { id: true, sku: true },
    });
    const bySku = new Map(variants.map((v) => [v.sku, v.id]));
    const unknown = skus.filter((s) => !bySku.has(s));
    if (unknown.length) throw new BadRequestException(`Không có mã hàng: ${unknown.slice(0, 20).join(', ')}`);
    if (type === 'receipt' && lines.some((l) => l.unitCost === undefined))
      throw new BadRequestException('Phiếu nhập cần đơn giá cho mọi dòng');
    if (type === 'count' && lines.some((l) => !Number.isInteger(l.quantity)))
      throw new BadRequestException('Số đếm phải là số nguyên');
    if (type === 'count' && skus.length !== lines.length)
      throw new BadRequestException('Mỗi mã hàng chỉ đếm một dòng');
    return lines.map((l) => ({
      variantId: bySku.get(l.sku)!,
      quantity: new Prisma.Decimal(l.quantity),
      unitCost: type === 'receipt' ? BigInt(l.unitCost!) : null,
    }));
  }

  /** NH261122-001: type prefix, Vietnam date, sequence of the day. */
  private async nextCode(type: (typeof TYPES)[number]) {
    const prefix = `${PREFIX[type]}${vnDate(new Date())}-`;
    const last = await this.db.stockDocument.findFirst({
      where: { code: { startsWith: prefix } },
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const seq = last ? Number(last.code.slice(prefix.length)) + 1 : 1;
    return `${prefix}${String(seq).padStart(3, '0')}`;
  }

  private async notInKiotviet(variantIds: string[]): Promise<Set<string>> {
    if (variantIds.length === 0) return new Set();
    const refs = await this.db.externalRef.findMany({
      where: { provider: 'kiotviet', entityType: 'variant', entityId: { in: variantIds } },
      select: { entityId: true },
    });
    const known = new Set(refs.map((r) => r.entityId));
    return new Set(variantIds.filter((id) => !known.has(id)));
  }

  private async newProductRows() {
    const rows = await this.db.$queryRaw<
      {
        sku: string;
        name: string;
        product_code: string;
        product_id: string;
        option_values: unknown;
        barcode: string | null;
        price: bigint;
        cost_avg: bigint;
        min_stock: unknown;
        weight_grams: number | null;
        description: string | null;
        category: string | null;
        brand: string | null;
      }[]
    >`
      SELECT v.sku, p.name, p.code AS product_code, p.id AS product_id, v.option_values, v.barcode, v.price, v.cost_avg,
             v.min_stock, v.weight_grams, p.description, c.name AS category, b.name AS brand
      FROM variants v
      JOIN products p ON p.id = v.product_id AND p.status <> 'archived'
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN brands b ON b.id = p.brand_id
      WHERE v.status = 'active'
        AND NOT EXISTS (SELECT 1 FROM external_refs r WHERE r.provider = 'kiotviet' AND r.entity_type = 'variant' AND r.entity_id = v.id)
      ORDER BY p.code, v.sku`;
    if (rows.length === 0) return [];
    const options = await this.db.productOption.findMany({
      where: { productId: { in: [...new Set(rows.map((r) => r.product_id))] } },
      orderBy: { sort: 'asc' },
      select: { productId: true, name: true },
    });
    const optionNames = new Map<string, string[]>();
    for (const o of options) optionNames.set(o.productId, [...(optionNames.get(o.productId) ?? []), o.name]);
    // Mã HH Liên quan: point every variant but the first of a product at the first one.
    const firstSku = new Map<string, string>();
    return rows.map((r) => {
      const values = Array.isArray(r.option_values) ? (r.option_values as string[]) : [];
      const names = optionNames.get(r.product_id) ?? [];
      const parent = firstSku.get(r.product_id);
      if (!parent) firstSku.set(r.product_id, r.sku);
      return {
        sku: r.sku,
        name: r.name,
        category: r.category,
        brand: r.brand,
        barcode: r.barcode,
        price: Number(r.price),
        cost: Number(r.cost_avg),
        minStock: n(r.min_stock),
        attributes: values
          .map((v, i): [string, string] => [names[i] ?? `Thuộc tính ${i + 1}`, v])
          .filter(([, v]) => v !== ''),
        parentSku: parent ?? null,
        weightGrams: r.weight_grams,
        description: r.description,
      };
    });
  }
}
