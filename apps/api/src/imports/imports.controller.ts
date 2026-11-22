import {
  BadRequestException,
  ConflictException,
  Controller,
  HttpCode,
  NotFoundException,
  Post,
  Query,
  UnprocessableEntityException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { KiotVietFormatError, parseProductList } from '@sugami/channels-kiotviet';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser, RequirePermissions } from '../auth/decorators.js';
import { parseInput } from '../common/validation.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ImportBlockedError, importKiotVietProducts } from './kiotviet-products.importer.js';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ImportQuery = z.object({
  dryRun: z
    .enum(['true', 'false', '1', '0'])
    .default('true')
    .transform((v) => v === 'true' || v === '1'),
  warehouse: z.string().trim().min(1).default('KHO-CHINH'),
});

interface UploadedXlsx {
  originalname: string;
  size: number;
  buffer: Buffer;
}

/** Excel imports from KiotViet. Every import is previewed first (dryRun=true, the default). */
@Controller('imports/kiotviet')
export class ImportsController {
  /** One import at a time: two overlapping runs of the same file would race on the same SKUs. */
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  @Post('products')
  @HttpCode(200)
  @RequirePermissions('catalog.write', 'inventory.write')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1 } }))
  async products(
    @UploadedFile() file: UploadedXlsx | undefined,
    @Query() query: unknown,
    @CurrentUser() user: AuthUser,
  ) {
    const { dryRun, warehouse } = parseInput(ImportQuery, query);
    if (!file) throw new BadRequestException('Chưa chọn file (trường "file")');
    const wh = await this.prisma.client.warehouse.findUnique({ where: { code: warehouse } });
    if (!wh) throw new NotFoundException(`Không có kho ${warehouse}`);
    if (this.running) throw new ConflictException('Đang có một lần import khác chạy, thử lại sau ít phút');
    this.running = true;
    try {
      const parsed = await parseProductList(file.buffer);
      const summary = await importKiotVietProducts(this.prisma.client, parsed, {
        warehouseId: wh.id,
        dryRun,
        userId: user.id,
      });
      return { file: file.originalname, warehouse: wh.code, ...summary };
    } catch (err) {
      if (err instanceof KiotVietFormatError) throw new UnprocessableEntityException(err.message);
      if (err instanceof ImportBlockedError) {
        throw new UnprocessableEntityException({ message: err.message, issues: err.errors });
      }
      throw err;
    } finally {
      this.running = false;
    }
  }
}
