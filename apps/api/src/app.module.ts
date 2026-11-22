import { Module } from '@nestjs/common';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { ImportsModule } from './imports/imports.module.js';
import { MediaModule } from './media/media.module.js';
import { HealthController } from './health/health.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersController } from './users/users.controller.js';

@Module({
  imports: [PrismaModule, AuthModule, AuditModule, MediaModule, ImportsModule, CatalogModule, OrdersModule],
  controllers: [HealthController, UsersController],
})
export class AppModule {}
