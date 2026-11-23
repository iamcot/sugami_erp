export interface RedisConnection {
  host: string;
  port: number;
  password?: string;
}

/** Parse REDIS_URL (redis://[:password@]host:port) into a BullMQ connection. */
export function redisConnectionFromUrl(url: string | undefined): RedisConnection {
  const parsed = new URL(url ?? 'redis://localhost:6379');
  if (parsed.protocol !== 'redis:') throw new Error(`Unsupported REDIS_URL protocol: ${parsed.protocol}`);
  const connection: RedisConnection = {
    host: parsed.hostname || 'localhost',
    port: parsed.port ? Number(parsed.port) : 6379,
  };
  if (parsed.password) connection.password = decodeURIComponent(parsed.password);
  return connection;
}

export const QUEUES = {
  system: 'system',
  pancake: 'pancake',
  allingo: 'allingo',
} as const;
