import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { confirmStockDocument, Prisma, StockDocumentError } from '@sugami/db';
import { landedCosts } from '@sugami/shared';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser, RequirePermissions } from '../auth/decorators.js';
import { parseInput } from '../common/validation.js';
import { PrismaService } from '../prisma/prisma.service.js';

const SupplierBody = z.object({
  name: z.string().trim().min(1, 'Nhập tên nhà cung cấp').max(191),
  platform: z.string().trim().max(32).nullish(),
  contact: z.string().trim().max(255).nullish(),
  note: z.string().max(5000).nullish(),
});

const OrderBody = z
  .object({
    supplierId: z.string().trim().max(36).nullish(),
    currency: z.enum(['VND', 'CNY']).default('VND'),
    fxRate: z.number().positive().max(1_000_000).nullish(),
    note: z.string().trim().max(255).nullish(),
    warehouseCode: z.string().trim().max(32).optional(),
    lines: z
      .array(
        z.object({
          sku: z.string().trim().min(1).max(64),
          qty: z.number().positive().max(1_000_000),
          /** Minor units of the order currency (đồng / fen). */
          unitPrice: z.number().int().min(0).max(10_000_000_000),
        }),
      )
      .min(1, 'Cần ít nhất một dòng hàng')
      .max(500),
    costs: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(64),
          amount: z.number().int().min(0).max(10_000_000_000),
        }),
      )
      .max(20)
      .default([]),
  })
  .refine((b) => b.currency === 'VND' || (b.fxRate ?? 0) > 0, { message: 'Đơn CNY cần tỷ giá VND/CNY' });

const ListQuery = z.object({
  status: z.enum(['draft', 'ordered', 'received', 'cancelled']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

const vnDate = (d: Date) =>
  new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(2, 10).replace(/-/g, '');

/** Suppliers and purchase orders. Receiving an order books a goods-received document at landed cost. */
@Controller()
export class PurchasingController {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  // ---- suppliers ----

  @Get('suppliers')
  @RequirePermissions('sourcing.read')
  async suppliers() {
    const rows = await this.db.supplier.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { orders: true } } },
    });
    return {
      data: rows.map((s) => ({
        id: s.id,
        name: s.name,
        platform: s.platform,
        contact: s.contact,
        note: s.note,
        orders: s._count.orders,
      })),
    };
  }

  @Post('suppliers')
  @RequirePermissions('sourcing.write')
  async createSupplier(@Body() raw: unknown) {
    const b = parseInput(SupplierBody, raw);
    if (await this.db.supplier.findUnique({ where: { name: b.name } }))
      throw new ConflictException('Nhà cung cấp này đã có');
    const s = await this.db.supplier.create({
      data: { name: b.name, platform: b.platform || null, contact: b.contact || null, note: b.note || null },
    });
    return { id: s.id };
  }

  @Patch('suppliers/:id')
  @RequirePermissions('sourcing.write')
  async updateSupplier(@Param('id') id: string, @Body() raw: unknown) {
    const b = parseInput(SupplierBody, raw);
    const dup = await this.db.supplier.findFirst({ where: { name: b.name, id: { not: id } } });
    if (dup) throw new ConflictException('Nhà cung cấp này đã có');
    const r = await this.db.supplier.updateMany({
      where: { id },
      data: { name: b.name, platform: b.platform || null, contact: b.contact || null, note: b.note || null },
    });
    if (!r.count) throw new NotFoundException('Không thấy nhà cung cấp');
    return { ok: true };
  }

  // ---- purchase orders ----

  @Get('purchase-orders')
  @RequirePermissions('sourcing.read')
  async list(@Query() raw: unknown) {
    const q = parseInput(ListQuery, raw);
    const where: Prisma.PurchaseOrderWhereInput = q.status ? { status: q.status } : {};
    const [total, rows] = await Promise.all([
      this.db.purchaseOrder.count({ where }),
      this.db.purchaseOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { supplier: { select: { name: true } }, lines: true, costs: true },
      }),
    ]);
    return {
      total,
      data: rows.map((o) => {
        const landed = this.landed(o);
        return {
          code: o.code,
          status: o.status,
          supplier: o.supplier?.name ?? null,
          currency: o.currency,
          lineCount: o.lines.length,
          qty: o.lines.reduce((a, l) => a + Number(l.qty), 0),
          totalVnd: landed.reduce((a, l) => a + l.valueVnd + l.extraVnd, 0),
          createdAt: o.createdAt.toISOString(),
          receivedAt: o.receivedAt?.toISOString() ?? null,
        };
      }),
    };
  }

  @Get('purchase-orders/:code')
  @RequirePermissions('sourcing.read')
  async get(@Param('code') code: string) {
    const o = await this.load(code);
    const landed = this.landed(o);
    return {
      code: o.code,
      status: o.status,
      supplierId: o.supplierId,
      supplier: o.supplier?.name ?? null,
      currency: o.currency,
      fxRate: o.fxRate === null ? null : Number(o.fxRate),
      note: o.note,
      warehouse: o.warehouse.code,
      orderedAt: o.orderedAt?.toISOString() ?? null,
      receivedAt: o.receivedAt?.toISOString() ?? null,
      stockDocument: o.stockDocumentId
        ? ((
            await this.db.stockDocument.findUnique({
              where: { id: o.stockDocumentId },
              select: { code: true },
            })
          )?.code ?? null)
        : null,
      costs: o.costs.map((c) => ({ label: c.label, amount: Number(c.amount) })),
      lines: o.lines.map((l, i) => ({
        sku: l.variant.sku,
        name: l.variant.product.name,
        option: (l.variant.optionValues as string[]).join(' / '),
        qty: Number(l.qty),
        unitPrice: Number(l.unitPrice),
        valueVnd: landed[i]!.valueVnd,
        extraVnd: landed[i]!.extraVnd,
        unitCost: landed[i]!.unitCost,
        currentCost: Number(l.variant.costAvg),
      })),
    };
  }

  @Post('purchase-orders')
  @RequirePermissions('sourcing.write')
  async create(@Body() raw: unknown, @CurrentUser() user: AuthUser) {
    const b = parseInput(OrderBody, raw);
    const warehouse = await this.warehouse(b.warehouseCode);
    const lines = await this.resolveLines(b.lines);
    await this.checkSupplier(b.supplierId);
    const code = await this.nextCode();
    await this.db.purchaseOrder.create({
      data: {
        code,
        supplierId: b.supplierId || null,
        warehouseId: warehouse.id,
        currency: b.currency,
        fxRate: b.currency === 'CNY' ? new Prisma.Decimal(b.fxRate!) : null,
        note: b.note || null,
        createdBy: user.id,
        lines: { create: lines },
        costs: { create: b.costs.map((c) => ({ label: c.label, amount: BigInt(c.amount) })) },
      },
    });
    return this.get(code);
  }

  /** Replace the content of an order that has not been received. */
  @Put('purchase-orders/:code')
  @RequirePermissions('sourcing.write')
  async update(@Param('code') code: string, @Body() raw: unknown) {
    const b = parseInput(OrderBody, raw);
    const o = await this.load(code);
    if (o.status === 'received' || o.status === 'cancelled')
      throw new ConflictException('Đơn đã nhận hoặc đã hủy, không sửa được');
    const lines = await this.resolveLines(b.lines);
    await this.checkSupplier(b.supplierId);
    await this.db.$transaction([
      this.db.purchaseOrderLine.deleteMany({ where: { orderId: o.id } }),
      this.db.purchaseOrderCost.deleteMany({ where: { orderId: o.id } }),
      this.db.purchaseOrder.update({
        where: { id: o.id },
        data: {
          supplierId: b.supplierId || null,
          currency: b.currency,
          fxRate: b.currency === 'CNY' ? new Prisma.Decimal(b.fxRate!) : null,
          note: b.note || null,
          lines: { create: lines },
          costs: { create: b.costs.map((c) => ({ label: c.label, amount: BigInt(c.amount) })) },
        },
      }),
    ]);
    return this.get(code);
  }

  /** Draft -> ordered (goods bought, on their way). */
  @Post('purchase-orders/:code/order')
  @HttpCode(200)
  @RequirePermissions('sourcing.write')
  async order(@Param('code') code: string) {
    const o = await this.load(code);
    if (o.status !== 'draft') throw new ConflictException('Chỉ đơn nháp mới chuyển sang đã đặt hàng');
    await this.db.purchaseOrder.update({
      where: { id: o.id },
      data: { status: 'ordered', orderedAt: new Date() },
    });
    return this.get(code);
  }

  /**
   * Goods arrived: book a goods-received document with landed unit costs, confirm it (stock and average
   * cost update through the ledger), and close the order.
   */
  @Post('purchase-orders/:code/receive')
  @HttpCode(200)
  @RequirePermissions('sourcing.receive')
  async receive(@Param('code') code: string, @CurrentUser() user: AuthUser) {
    const o = await this.load(code);
    if (o.status !== 'draft' && o.status !== 'ordered')
      throw new ConflictException('Đơn này đã nhận hoặc đã hủy');
    const landed = this.landed(o);
    const docCode = await this.nextDocCode();
    const doc = await this.db.stockDocument.create({
      data: {
        code: docCode,
        type: 'receipt',
        warehouseId: o.warehouseId,
        reason: `Nhập hàng ${o.code}${o.supplier ? ` · ${o.supplier.name}` : ''}`.slice(0, 255),
        createdBy: user.id,
        lines: {
          create: o.lines.map((l, i) => ({
            variantId: l.variantId,
            quantity: l.qty,
            unitCost: BigInt(landed[i]!.unitCost),
          })),
        },
      },
    });
    try {
      await confirmStockDocument(this.db, doc.id, user.id);
    } catch (err) {
      await this.db.stockDocument.delete({ where: { id: doc.id } }).catch(() => undefined);
      if (err instanceof StockDocumentError) throw new ConflictException(err.message);
      throw err;
    }
    await this.db.purchaseOrder.update({
      where: { id: o.id },
      data: { status: 'received', receivedAt: new Date(), stockDocumentId: doc.id },
    });
    return this.get(code);
  }

  @Post('purchase-orders/:code/cancel')
  @HttpCode(200)
  @RequirePermissions('sourcing.write')
  async cancel(@Param('code') code: string) {
    const o = await this.load(code);
    if (o.status === 'received') throw new ConflictException('Đơn đã nhận hàng, không hủy được');
    await this.db.purchaseOrder.update({ where: { id: o.id }, data: { status: 'cancelled' } });
    return this.get(code);
  }

  // ---- helpers ----

  private async load(code: string) {
    const o = await this.db.purchaseOrder.findUnique({
      where: { code: decodeURIComponent(code) },
      include: {
        supplier: { select: { name: true } },
        warehouse: { select: { code: true } },
        costs: { orderBy: { id: 'asc' } },
        lines: {
          orderBy: { sort: 'asc' },
          include: { variant: { include: { product: { select: { name: true } } } } },
        },
      },
    });
    if (!o) throw new NotFoundException('Không thấy đơn nhập');
    return o;
  }

  private landed(o: {
    currency: string;
    fxRate: Prisma.Decimal | null;
    lines: { qty: Prisma.Decimal; unitPrice: bigint }[];
    costs: { amount: bigint }[];
  }) {
    return landedCosts(
      o.lines.map((l) => ({ qty: Number(l.qty), unitPrice: Number(l.unitPrice) })),
      {
        currency: o.currency === 'CNY' ? 'CNY' : 'VND',
        fxRate: o.fxRate === null ? null : Number(o.fxRate),
        extraCostVnd: o.costs.reduce((a, c) => a + Number(c.amount), 0),
      },
    );
  }

  private async warehouse(code = 'KHO-CHINH') {
    const w = await this.db.warehouse.findUnique({ where: { code } });
    if (!w || !w.isActive) throw new BadRequestException('Không tìm thấy kho');
    return w;
  }

  private async checkSupplier(id: string | null | undefined) {
    if (id && !(await this.db.supplier.findUnique({ where: { id }, select: { id: true } })))
      throw new BadRequestException('Nhà cung cấp không tồn tại');
  }

  private async resolveLines(lines: z.infer<typeof OrderBody>['lines']) {
    const skus = [...new Set(lines.map((l) => l.sku))];
    if (skus.length !== lines.length) throw new BadRequestException('Mỗi mã hàng chỉ một dòng');
    const found = await this.db.variant.findMany({
      where: { sku: { in: skus } },
      select: { id: true, sku: true },
    });
    const bySku = new Map(found.map((v) => [v.sku, v.id]));
    const unknown = skus.filter((s) => !bySku.has(s));
    if (unknown.length) throw new BadRequestException(`Không có mã hàng: ${unknown.slice(0, 20).join(', ')}`);
    return lines.map((l, i) => ({
      variantId: bySku.get(l.sku)!,
      qty: new Prisma.Decimal(l.qty),
      unitPrice: BigInt(l.unitPrice),
      sort: i,
    }));
  }

  /** PO261123-001 */
  private async nextCode() {
    return this.seq('purchaseOrder', `PO${vnDate(new Date())}-`);
  }

  /** NH261123-001, same scheme as the goods-received documents made on the stock pages. */
  private async nextDocCode() {
    return this.seq('stockDocument', `NH${vnDate(new Date())}-`);
  }

  private async seq(model: 'purchaseOrder' | 'stockDocument', prefix: string) {
    const args = {
      where: { code: { startsWith: prefix } },
      orderBy: { code: 'desc' as const },
      select: { code: true },
    };
    const last =
      model === 'purchaseOrder'
        ? await this.db.purchaseOrder.findFirst(args)
        : await this.db.stockDocument.findFirst(args);
    const n = last ? Number(last.code.slice(prefix.length)) + 1 : 1;
    return `${prefix}${String(n).padStart(3, '0')}`;
  }
}
