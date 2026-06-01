import Redis from 'ioredis';
import { logger } from './logger';

let redis: Redis;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      password: process.env.REDIS_PASSWORD || undefined,
      retryStrategy: (times) => Math.min(times * 100, 3000),
      lazyConnect: true,
    });

    redis.on('error', (err) => logger.error({ err }, 'Redis error'));
    redis.on('connect', () => logger.info('Redis connected'));
  }
  return redis;
}

export async function acquireLock(key: string, ttlMs = 5000): Promise<boolean> {
  const r = getRedis();
  const result = await r.set(`lock:${key}`, '1', 'PX', ttlMs, 'NX');
  return result === 'OK';
}

export async function releaseLock(key: string): Promise<void> {
  await getRedis().del(`lock:${key}`);
}
