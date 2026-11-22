import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  PayloadTooLargeException,
  Post,
  Put,
  Query,
  Req,
  Res,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { MediaAsset } from '@sugami/db';
import { LocalStorage } from '@sugami/storage';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { CurrentUser, Public, RequirePermissions } from '../auth/decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { parseInput } from '../common/validation.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { mirrorVariantImages } from './media-mirror.js';
import { mediaPath, UPLOAD_TYPES } from './media.rules.js';
import { StorageService } from './storage.service.js';

const CreateUploadBody = z.object({
  filename: z.string().trim().min(1).max(255),
  contentType: z.string().trim().toLowerCase(),
  sizeBytes: z.number().int().positive(),
});
const MirrorBody = z.object({
  dryRun: z.boolean().default(true),
  limit: z.number().int().min(1).max(100).default(40),
  afterSku: z.string().max(64).optional(),
});
const ListQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });

/** Upload flow: POST /media/uploads → client PUTs the file to `upload.url` → POST /media/:id/complete. */
@Controller('media')
export class MediaController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  private get storage() {
    return this.storageService.storage;
  }

  private async dto(a: MediaAsset) {
    return {
      id: a.id,
      kind: a.kind,
      status: a.status,
      originalName: a.originalName,
      mime: a.mime,
      sizeBytes: Number(a.sizeBytes),
      width: a.width,
      height: a.height,
      alt: a.alt,
      tags: a.tags,
      createdAt: a.createdAt.toISOString(),
      url: a.status === 'ready' ? await this.storage.url(a.storageKey) : null,
    };
  }

  @Post('uploads')
  @RequirePermissions('media.write')
  async createUpload(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    const { filename, contentType, sizeBytes } = parseInput(CreateUploadBody, body);
    const rule = UPLOAD_TYPES[contentType];
    if (!rule) throw new UnsupportedMediaTypeException(`Không hỗ trợ định dạng ${contentType}`);
    if (sizeBytes > rule.maxBytes) {
      throw new PayloadTooLargeException(`File tối đa ${Math.round(rule.maxBytes / 1024 / 1024)} MB`);
    }
    const id = crypto.randomUUID();
    const storageKey = this.storage.key(mediaPath(id, rule.ext));
    const asset = await this.prisma.client.mediaAsset.create({
      data: {
        id,
        kind: rule.kind,
        storageKey,
        originalName: filename,
        mime: contentType,
        sizeBytes: BigInt(sizeBytes),
        uploadedBy: user.id,
      },
    });
    const upload = await this.storage.presignUpload(storageKey, { contentType, sizeBytes });
    return { asset: await this.dto(asset), upload: { ...upload, expiresAt: upload.expiresAt.toISOString() } };
  }

  @Post(':id/complete')
  @HttpCode(200)
  @RequirePermissions('media.write')
  async complete(@Param('id') id: string) {
    const asset = await this.prisma.client.mediaAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('Không tìm thấy file');
    if (asset.status === 'ready') return { asset: await this.dto(asset) };
    const info = await this.storage.head(asset.storageKey);
    if (!info) throw new ConflictException('Chưa thấy file trên kho lưu trữ, hãy tải lên lại');
    if (info.size !== Number(asset.sizeBytes)) {
      throw new ConflictException(`Kích thước file không khớp (${info.size} ≠ ${asset.sizeBytes})`);
    }
    const ready = await this.prisma.client.mediaAsset.update({ where: { id }, data: { status: 'ready' } });
    return { asset: await this.dto(ready) };
  }

  /** Copy variant images from their source URLs into storage, a batch at a time (call again with nextAfter). */
  @Post('mirror-variant-images')
  @HttpCode(200)
  @RequirePermissions('media.write')
  mirror(@Body() raw: unknown) {
    const { dryRun, limit, afterSku } = parseInput(MirrorBody, raw ?? {});
    return mirrorVariantImages(this.prisma.client, this.storage, { dryRun, limit, afterSku });
  }

  @Get()
  @RequirePermissions('catalog.read')
  async list(@Query() query: unknown) {
    const { limit } = parseInput(ListQuery, query);
    const assets = await this.prisma.client.mediaAsset.findMany({
      where: { status: 'ready' },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return { data: await Promise.all(assets.map((a) => this.dto(a))) };
  }

  @Get(':id')
  @RequirePermissions('catalog.read')
  async get(@Param('id') id: string) {
    const asset = await this.prisma.client.mediaAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('Không tìm thấy file');
    return { asset: await this.dto(asset) };
  }

  // ---- Local driver only (dev/offline): stand-ins for S3 presigned PUT and object GET ----

  private local(): LocalStorage {
    if (!(this.storage instanceof LocalStorage)) throw new NotFoundException();
    return this.storage;
  }

  /** Authorised by the signed token from createUpload, like an S3 presigned URL. */
  @Public()
  @Put('local-upload/:token')
  @HttpCode(200)
  async localUpload(@Param('token') token: string, @Req() req: Request) {
    const local = this.local();
    const grant = local.verifyUploadToken(token);
    if (!grant) throw new ForbiddenException('Link tải lên không hợp lệ hoặc đã hết hạn');
    if ((req.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase() !== grant.contentType) {
      throw new ForbiddenException('Content-Type không khớp');
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req as AsyncIterable<Buffer>) {
      size += chunk.length;
      if (size > grant.sizeBytes) throw new PayloadTooLargeException('File lớn hơn kích thước đã khai báo');
      chunks.push(chunk);
    }
    if (size !== grant.sizeBytes) throw new ConflictException('Kích thước file không khớp');
    await local.put(grant.key, Buffer.concat(chunks), grant.contentType);
    return { ok: true };
  }

  @Get('local-files/*path')
  @RequirePermissions('catalog.read')
  async localFile(@Param('path') path: string | string[], @Res() res: Response) {
    const local = this.local();
    const key = Array.isArray(path) ? path.join('/') : path;
    const asset = await this.prisma.client.mediaAsset.findUnique({ where: { storageKey: key } });
    if (!asset || !(await local.head(key))) throw new NotFoundException();
    res.setHeader('Content-Type', asset.mime);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(await local.read(key));
  }
}
