import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client.js';
import { withShopScope } from './shop-scope.js';

export interface MysqlConnectionOptions {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

/** Parse mysql://user:pass@host:port/db into driver options. */
export function parseDatabaseUrl(url: string): MysqlConnectionOptions {
  const u = new URL(url);
  if (u.protocol !== 'mysql:' && u.protocol !== 'mariadb:') {
    throw new Error(`DATABASE_URL must start with mysql://, got ${u.protocol}`);
  }
  const database = u.pathname.replace(/^\//, '');
  if (!database) throw new Error('DATABASE_URL is missing the database name');
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database,
  };
}

/** Prisma client whose queries stay inside the current shop (see runAsShop; Sugami when none is set). */
export function createPrismaClient(url = process.env.DATABASE_URL): PrismaClient {
  if (!url) throw new Error('DATABASE_URL is not set');
  const adapter = new PrismaMariaDb({ ...parseDatabaseUrl(url), connectionLimit: 10 });
  return withShopScope(new PrismaClient({ adapter }));
}
