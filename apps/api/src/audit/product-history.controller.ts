import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { z } from 'zod';
import { parseInput } from '../common/validation.js';
import { RequirePermissions } from '../auth/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';

const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) });

export type HistoryEntry =
  | {
      kind: 'change';
      at: string;
      action: string;
      entityType: string;
      entityId: string;
      sku: string | null;
      user: { id: string; name: string } | null;
      diff: unknown;
    }
  | {
      kind: 'stock';
      at: string;
      type: string;
      sku: string;
      warehouse: string;
      qtyDelta: string;
      balanceAfter: string;
      unitCost: string | null;
      note: string | null;
    };

/** Change history of one product: field edits (audit_logs) of the product and its variants, plus stock movements. */
@Controller('products')
export class ProductHistoryController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':id/history')
  @RequirePermissions('catalog.read')
  async history(@Param('id') id: string, @Query() rawQuery: unknown): Promise<{ data: HistoryEntry[] }> {
    const { limit } = parseInput(querySchema, rawQuery);
    const db = this.prisma.client;
    const product = await db.product.findUnique({
      where: { id },
      select: { id: true, variants: { select: { id: true, sku: true } } },
    });
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');
    const skuById = new Map(product.variants.map((v) => [v.id, v.sku]));
    const variantIds = [...skuById.keys()];

    const [logs, movements] = await Promise.all([
      db.auditLog.findMany({
        where: {
          OR: [
            { entityType: 'product', entityId: id },
            ...(variantIds.length ? [{ entityType: 'variant', entityId: { in: variantIds } }] : []),
          ],
        },
        orderBy: { id: 'desc' },
        take: limit,
        include: { user: { select: { id: true, name: true } } },
      }),
      variantIds.length
        ? db.stockMovement.findMany({
            where: { variantId: { in: variantIds } },
            orderBy: { id: 'desc' },
            take: limit,
            include: { warehouse: { select: { code: true } } },
          })
        : Promise.resolve([]),
    ]);

    const entries: HistoryEntry[] = [
      ...logs.map((l): HistoryEntry => ({
        kind: 'change',
        at: l.createdAt.toISOString(),
        action: l.action,
        entityType: l.entityType,
        entityId: l.entityId,
        sku: l.entityType === 'variant' ? (skuById.get(l.entityId) ?? null) : null,
        user: l.user,
        diff: l.diff,
      })),
      ...movements.map((m): HistoryEntry => ({
        kind: 'stock',
        at: m.occurredAt.toISOString(),
        type: m.type,
        sku: skuById.get(m.variantId) ?? '',
        warehouse: m.warehouse.code,
        qtyDelta: m.qtyDelta.toString(),
        balanceAfter: m.balanceAfter.toString(),
        unitCost: m.unitCost?.toString() ?? null,
        note: m.note,
      })),
    ];
    entries.sort((a, b) => b.at.localeCompare(a.at));
    return { data: entries.slice(0, limit) };
  }
}
