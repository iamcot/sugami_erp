import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { currentShopId, Prisma } from '@sugami/db';
import { buildSku, toSearchKey, variantMatrix } from '@sugami/shared';
import { z } from 'zod';
import { RequirePermissions } from '../auth/decorators.js';
import { parseInput } from '../common/validation.js';
import { PrismaService } from '../prisma/prisma.service.js';

const Money = z.number().int().min(0).max(10_000_000_000);
const Text = (max: number) => z.string().trim().max(max);

const VariantInput = z.object({
  /** One value per option, in option order; empty when the product has no options. */
  optionValues: z.array(Text(64).min(1)).max(3).default([]),
  /** Defaults to the product code (single variant) or code-VALUE-VALUE. */
  sku: Text(64).optional(),
  barcode: Text(64).nullish(),
  price: Money.default(0),
  minStock: z.number().min(0).max(1_000_000).default(0),
});

const Kind = z.enum(['goods', 'material', 'finished']);
const Unit = Text(32).min(1);

/** Bill of materials: quantity of each material for one unit of the finished variant. */
const Components = z
  .array(z.object({ variantId: Text(36).min(1), qty: z.number().positive().max(100_000) }))
  .max(50);

const CreateBody = z.object({
  /** Empty = next SP number. */
  code: Text(64).optional(),
  name: Text(255).min(1, 'Nhập tên sản phẩm'),
  status: z.enum(['draft', 'active']).default('active'),
  /** goods (resold as is), material (used in finished products), finished (made from materials). */
  kind: Kind.default('goods'),
  /** Unit sold/counted in: cái, cành, bó, mét... */
  unit: Unit.optional(),
  /** Finished products: materials of one unit, applied to every variant created. */
  components: Components.optional(),
  description: Text(20_000).nullish(),
  categoryId: Text(36).nullish(),
  brand: Text(191).nullish(),
  options: z
    .array(z.object({ name: Text(64).min(1), values: z.array(Text(64).min(1)).min(1).max(50) }))
    .max(3)
    .default([]),
  /** Explicit list; when omitted and there are options, the full matrix is created. */
  variants: z.array(VariantInput).max(300).optional(),
  price: Money.default(0),
});

const UpdateBody = z.object({
  name: Text(255).min(1).optional(),
  kind: Kind.optional(),
  unit: Unit.optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
  description: Text(20_000).nullable().optional(),
  categoryId: Text(36).nullable().optional(),
  brand: Text(191).nullable().optional(),
});

const VariantUpdate = z.object({
  price: Money.optional(),
  compareAtPrice: Money.nullable().optional(),
  barcode: Text(64).nullable().optional(),
  minStock: z.number().min(0).max(1_000_000).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  weightGrams: z.number().int().min(0).max(1_000_000).nullable().optional(),
});

const AddVariant = VariantInput.extend({ optionValues: z.array(Text(64).min(1)).max(3) });

@Controller()
export class ProductEditController {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  /** Categories and brands for the product form. */
  @Get('catalog/meta')
  @RequirePermissions('catalog.read')
  async meta() {
    const [cats, brands, last] = await Promise.all([
      this.db.category.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true, parentId: true },
      }),
      this.db.brand.findMany({ orderBy: { name: 'asc' }, select: { name: true } }),
      this.nextCode(),
    ]);
    const byId = new Map(cats.map((c) => [c.id, c]));
    const path = (id: string): string => {
      const c = byId.get(id);
      return c ? (c.parentId && byId.has(c.parentId) ? `${path(c.parentId)} / ${c.name}` : c.name) : '';
    };
    return {
      categories: cats
        .map((c) => ({ id: c.id, name: path(c.id) }))
        .sort((a, b) => a.name.localeCompare(b.name, 'vi')),
      brands: brands.map((b) => b.name),
      nextCode: last,
    };
  }

  /** Next free "SP000123" style code. */
  private async nextCode(): Promise<string> {
    const rows = await this.db.$queryRaw<{ n: unknown }[]>`
      SELECT MAX(CAST(SUBSTRING(code, 3) AS UNSIGNED)) AS n FROM products WHERE shop_id = ${currentShopId()} AND code REGEXP '^SP[0-9]+$'`;
    return `SP${String(Number(rows[0]?.n ?? 0) + 1).padStart(6, '0')}`;
  }

  private async brandId(name: string | null | undefined): Promise<string | null | undefined> {
    if (name === undefined) return undefined;
    if (!name) return null;
    const found = await this.db.brand.findFirst({ where: { name } });
    return (found ?? (await this.db.brand.create({ data: { name } }))).id;
  }

  private async assertFree(skus: string[], barcodes: string[], exceptVariantIds: string[] = []) {
    if (new Set(skus).size !== skus.length)
      throw new BadRequestException('Có mã biến thể bị trùng trong danh sách');
    const sku = await this.db.variant.findFirst({
      where: { sku: { in: skus }, id: { notIn: exceptVariantIds } },
      select: { sku: true },
    });
    if (sku) throw new ConflictException(`Mã ${sku.sku} đã có`);
    if (barcodes.length) {
      const bc = await this.db.variant.findFirst({
        where: { barcode: { in: barcodes }, id: { notIn: exceptVariantIds } },
        select: { barcode: true, sku: true },
      });
      if (bc) throw new ConflictException(`Mã vạch ${bc.barcode} đã dùng cho ${bc.sku}`);
    }
  }

  @Post('products')
  @RequirePermissions('catalog.write')
  async create(@Body() raw: unknown) {
    const b = parseInput(CreateBody, raw);
    const code = (b.code || (await this.nextCode())).toUpperCase().replace(/\s+/g, '');
    if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(code))
      throw new BadRequestException('Mã sản phẩm chỉ gồm chữ, số, - . _');
    if (await this.db.product.findFirst({ where: { code } })) throw new ConflictException(`Mã ${code} đã có`);

    const optionNames = b.options.map((o) => o.name);
    if (new Set(optionNames).size !== optionNames.length)
      throw new BadRequestException('Tên thuộc tính bị trùng');
    const options = b.options.map((o) => ({ name: o.name, values: [...new Set(o.values)] }));
    const wanted: z.infer<typeof VariantInput>[] =
      b.variants ??
      (options.length
        ? variantMatrix(options.map((o) => o.values)).map((optionValues) => ({
            optionValues,
            price: b.price,
            minStock: 0,
          }))
        : [{ optionValues: [], price: b.price, minStock: 0 }]);
    if (wanted.length === 0) throw new BadRequestException('Cần ít nhất một biến thể');
    for (const v of wanted) {
      if (v.optionValues.length !== options.length)
        throw new BadRequestException('Mỗi biến thể phải có đủ giá trị cho mọi thuộc tính');
      options.forEach((o, i) => {
        if (!o.values.includes(v.optionValues[i]!)) o.values.push(v.optionValues[i]!);
      });
    }
    const rows = wanted.map((v) => ({
      ...v,
      sku: (v.sku || buildSku(code, v.optionValues)).toUpperCase(),
      barcode: v.barcode || null,
    }));
    await this.assertFree(
      rows.map((r) => r.sku),
      rows.flatMap((r) => (r.barcode ? [r.barcode] : [])),
    );
    const brandId = await this.brandId(b.brand);
    if (b.categoryId && !(await this.db.category.findUnique({ where: { id: b.categoryId } })))
      throw new BadRequestException('Nhóm hàng không tồn tại');
    const components = b.kind === 'finished' ? await this.checkComponents(b.components ?? []) : [];

    const product = await this.db.product.create({
      data: {
        code,
        name: b.name,
        searchKey: toSearchKey(b.name).slice(0, 255),
        status: b.status,
        kind: b.kind,
        ...(b.unit ? { unit: b.unit } : {}),
        description: b.description || null,
        categoryId: b.categoryId || null,
        brandId: brandId ?? null,
        options: {
          create: options.map((o, i) => ({
            name: o.name,
            sort: i,
            values: { create: o.values.map((value, j) => ({ value, sort: j })) },
          })),
        },
        variants: {
          create: rows.map((r) => ({
            sku: r.sku,
            barcode: r.barcode,
            optionValues: r.optionValues,
            price: BigInt(r.price),
            minStock: new Prisma.Decimal(r.minStock),
            ...(components.length
              ? {
                  comboItems: {
                    create: components.map((c) => ({
                      componentVariantId: c.variantId,
                      quantity: new Prisma.Decimal(c.qty),
                    })),
                  },
                }
              : {}),
          })),
        },
      },
      select: { code: true },
    });
    return { code: product.code, variants: rows.length };
  }

  @Patch('products/:code')
  @RequirePermissions('catalog.write')
  async update(@Param('code') code: string, @Body() raw: unknown) {
    const b = parseInput(UpdateBody, raw);
    const p = await this.db.product.findFirst({
      where: { code: decodeURIComponent(code) },
      select: { id: true },
    });
    if (!p) throw new NotFoundException('Không thấy sản phẩm');
    const brandId = await this.brandId(b.brand);
    await this.db.product.update({
      where: { id: p.id },
      data: {
        ...(b.name !== undefined ? { name: b.name, searchKey: toSearchKey(b.name).slice(0, 255) } : {}),
        ...(b.status !== undefined ? { status: b.status } : {}),
        ...(b.kind !== undefined ? { kind: b.kind } : {}),
        ...(b.unit !== undefined ? { unit: b.unit } : {}),
        ...(b.description !== undefined ? { description: b.description || null } : {}),
        ...(b.categoryId !== undefined ? { categoryId: b.categoryId || null } : {}),
        ...(brandId !== undefined ? { brandId } : {}),
      },
    });
    return { ok: true };
  }

  @Patch('variants/:sku')
  @RequirePermissions('catalog.write')
  async updateVariant(@Param('sku') sku: string, @Body() raw: unknown) {
    const b = parseInput(VariantUpdate, raw);
    const v = await this.db.variant.findFirst({
      where: { sku: decodeURIComponent(sku) },
      select: { id: true },
    });
    if (!v) throw new NotFoundException('Không thấy biến thể');
    if (b.barcode) await this.assertFree([], [b.barcode], [v.id]);
    await this.db.variant.update({
      where: { id: v.id },
      data: {
        ...(b.price !== undefined ? { price: BigInt(b.price) } : {}),
        ...(b.compareAtPrice !== undefined
          ? { compareAtPrice: b.compareAtPrice === null ? null : BigInt(b.compareAtPrice) }
          : {}),
        ...(b.barcode !== undefined ? { barcode: b.barcode || null } : {}),
        ...(b.minStock !== undefined ? { minStock: new Prisma.Decimal(b.minStock) } : {}),
        ...(b.status !== undefined ? { status: b.status } : {}),
        ...(b.weightGrams !== undefined ? { weightGrams: b.weightGrams } : {}),
      },
    });
    return { ok: true };
  }

  /** Materials must exist in this shop, be materials (or goods), and not repeat. */
  private async checkComponents(list: z.infer<typeof Components>, selfId?: string) {
    const ids = list.map((c) => c.variantId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Có nguyên liệu bị trùng');
    if (selfId && ids.includes(selfId))
      throw new BadRequestException('Thành phẩm không thể là nguyên liệu của chính nó');
    const found = await this.db.variant.findMany({
      where: { id: { in: ids } },
      select: { id: true, sku: true, product: { select: { kind: true } } },
    });
    if (found.length !== ids.length) throw new BadRequestException('Có nguyên liệu không tồn tại');
    const bad = found.find((v) => v.product.kind === 'finished');
    if (bad) throw new BadRequestException(`${bad.sku} là thành phẩm, không dùng làm nguyên liệu được`);
    return list;
  }

  /** Replace the bill of materials of a finished variant (materials per unit). */
  @Put('variants/:sku/components')
  @RequirePermissions('catalog.write')
  async setComponents(@Param('sku') sku: string, @Body() raw: unknown) {
    const list = parseInput(z.object({ components: Components }), raw).components;
    const v = await this.db.variant.findFirst({
      where: { sku: decodeURIComponent(sku) },
      select: { id: true, product: { select: { kind: true } } },
    });
    if (!v) throw new NotFoundException('Không thấy biến thể');
    if (v.product.kind !== 'finished')
      throw new BadRequestException('Chỉ sản phẩm loại thành phẩm mới có định mức nguyên liệu');
    await this.checkComponents(list, v.id);
    await this.db.$transaction([
      this.db.comboItem.deleteMany({ where: { comboVariantId: v.id } }),
      this.db.comboItem.createMany({
        data: list.map((c) => ({
          comboVariantId: v.id,
          componentVariantId: c.variantId,
          quantity: new Prisma.Decimal(c.qty),
        })),
      }),
    ]);
    return { ok: true, components: list.length };
  }

  /** Add one more variant to an existing product; new option values are added to the product's options. */
  @Post('products/:code/variants')
  @RequirePermissions('catalog.write')
  async addVariant(@Param('code') code: string, @Body() raw: unknown) {
    const b = parseInput(AddVariant, raw);
    const p = await this.db.product.findFirst({
      where: { code: decodeURIComponent(code) },
      include: { options: { orderBy: { sort: 'asc' }, include: { values: true } } },
    });
    if (!p) throw new NotFoundException('Không thấy sản phẩm');
    if (b.optionValues.length !== p.options.length)
      throw new BadRequestException(
        `Sản phẩm có ${p.options.length} thuộc tính, cần đủ giá trị cho từng thuộc tính`,
      );
    const sku = (b.sku || buildSku(p.code, b.optionValues)).toUpperCase();
    await this.assertFree([sku], b.barcode ? [b.barcode] : []);
    const dup = await this.db.variant.findMany({
      where: { productId: p.id },
      select: { optionValues: true },
    });
    if (dup.some((d) => JSON.stringify(d.optionValues) === JSON.stringify(b.optionValues)))
      throw new ConflictException('Biến thể với các giá trị này đã có');
    for (const [i, o] of p.options.entries()) {
      const value = b.optionValues[i]!;
      if (!o.values.some((x) => x.value === value))
        await this.db.productOptionValue.create({ data: { optionId: o.id, value, sort: o.values.length } });
    }
    await this.db.variant.create({
      data: {
        productId: p.id,
        sku,
        barcode: b.barcode || null,
        optionValues: b.optionValues,
        price: BigInt(b.price),
        minStock: new Prisma.Decimal(b.minStock),
      },
    });
    return { sku };
  }
}
