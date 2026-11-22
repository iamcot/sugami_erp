import { Module } from '@nestjs/common';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { HealthController } from './health/health.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersController } from './users/users.controller.js';

@Module({
  imports: [PrismaModule, AuthModule, AuditModule],
  controllers: [HealthController, UsersController],
})
export class AppModule {}
