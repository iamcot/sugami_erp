import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { RequirePermissions } from '../auth/decorators.js';
import { parseInput } from '../common/validation.js';
import { PrismaService } from '../prisma/prisma.service.js';

const Align = z.enum(['left', 'center', 'right']);
const Block = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    /** {{code}} {{date}} {{customer}} {{total}} are replaced when printing. */
    text: z.string().max(500),
    align: Align.default('left'),
    bold: z.boolean().default(false),
    size: z.enum(['sm', 'md', 'lg']).default('md'),
  }),
  z.object({ type: z.literal('order_info') }),
  z.object({ type: z.literal('lines') }),
  z.object({ type: z.literal('totals') }),
  z.object({ type: z.literal('divider') }),
]);

const Body_ = z.object({
  name: z.string().trim().min(1).max(100),
  paperWidth: z.union([z.literal(58), z.literal(80)]).default(80),
  blocks: z.array(Block).max(60),
  isDefault: z.boolean().default(false),
});

const DEFAULT_BLOCKS = [
  { type: 'text', text: 'SUGAMI', align: 'center', bold: true, size: 'lg' },
  { type: 'text', text: 'Cảm ơn quý khách!', align: 'center', bold: false, size: 'sm' },
  { type: 'divider' },
  { type: 'order_info' },
  { type: 'lines' },
  { type: 'totals' },
  { type: 'divider' },
  { type: 'text', text: 'Hẹn gặp lại quý khách', align: 'center', bold: false, size: 'sm' },
];

/** Receipt layouts printed on the bill printer; readable by sellers, editable by admins. */
@Controller('receipt-templates')
export class ReceiptsController {
  constructor(private readonly prisma: PrismaService) {}

  private view(t: { id: string; name: string; paperWidth: number; blocks: unknown; isDefault: boolean }) {
    return { id: t.id, name: t.name, paperWidth: t.paperWidth, blocks: t.blocks, isDefault: t.isDefault };
  }

  /** Always returns at least one template: the built-in one is created on first use. */
  @Get()
  @RequirePermissions('orders.read')
  async list() {
    const db = this.prisma.client;
    if (!(await db.receiptTemplate.count()))
      await db.receiptTemplate.create({
        data: { name: 'Mẫu mặc định', paperWidth: 80, blocks: DEFAULT_BLOCKS, isDefault: true },
      });
    const rows = await db.receiptTemplate.findMany({ orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
    return { data: rows.map((r) => this.view(r)) };
  }

  @Post()
  @RequirePermissions('settings.write')
  async create(@Body() raw: unknown) {
    const b = parseInput(Body_, raw);
    const db = this.prisma.client;
    if (b.isDefault) await db.receiptTemplate.updateMany({ data: { isDefault: false } });
    return this.view(await db.receiptTemplate.create({ data: b }));
  }

  @Put(':id')
  @RequirePermissions('settings.write')
  async update(@Param('id') id: string, @Body() raw: unknown) {
    const b = parseInput(Body_, raw);
    const db = this.prisma.client;
    if (!(await db.receiptTemplate.findUnique({ where: { id } }))) throw new NotFoundException('Không tìm thấy mẫu');
    if (b.isDefault) await db.receiptTemplate.updateMany({ where: { id: { not: id } }, data: { isDefault: false } });
    return this.view(await db.receiptTemplate.update({ where: { id }, data: b }));
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('settings.write')
  async remove(@Param('id') id: string) {
    const db = this.prisma.client;
    const t = await db.receiptTemplate.findUnique({ where: { id } });
    if (!t) return;
    await db.receiptTemplate.delete({ where: { id } });
    if (t.isDefault) {
      const first = await db.receiptTemplate.findFirst({ orderBy: { createdAt: 'asc' } });
      if (first) await db.receiptTemplate.update({ where: { id: first.id }, data: { isDefault: true } });
    }
  }
}
