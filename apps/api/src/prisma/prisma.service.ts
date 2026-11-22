import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { createPrismaClient, type PrismaClient, withAudit } from '@sugami/db';

/** One shared Prisma client for the API process; writes to audited models land in audit_logs. */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  private readonly base: PrismaClient = createPrismaClient();
  readonly client: PrismaClient = withAudit(this.base);

  async onModuleDestroy(): Promise<void> {
    await this.base.$disconnect();
  }
}
