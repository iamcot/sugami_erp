import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  // Behind Cloudflare Tunnel / Next.js rewrites: trust the first proxy for req.ip.
  app.set('trust proxy', 1);
  app.use(cookieParser());
  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.enableShutdownHooks();
  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
  console.log(`Sugami API listening on http://localhost:${port}`);
}

void bootstrap();
