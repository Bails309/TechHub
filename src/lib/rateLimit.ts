import { RateLimiterMemory, RateLimiterRedis } from 'rate-limiter-flexible';
import IORedis, { RedisOptions } from 'ioredis';

import { getSharedRedisClient } from './redis';

const POINTS = Number(process.env.RATE_LIMIT_POINTS || '10');
const DURATION = Number(process.env.RATE_LIMIT_DURATION || '60');

let memoryLimiter: RateLimiterMemory | null = null;
let redisLimiter: RateLimiterRedis | null = null;

let limiterInitPromise: Promise<void> | null = null;

async function ensureLimiter() {
  if (limiterInitPromise) return limiterInitPromise;

  limiterInitPromise = (async () => {
    const store = (process.env.RATE_LIMIT_STORE || 'memory') as 'memory' | 'redis';
    if (process.env.NODE_ENV === 'production' && store !== 'redis') {
      // In production we must require a centralized rate limiter (Redis)
      // to avoid bypass in multi-instance or serverless deployments.
      throw new Error(
        'SECURITY: RATE_LIMIT_STORE must be set to "redis" in production to ensure centralized rate limiting.'
      );
    }

    if (store === 'redis') {
      const client = await getSharedRedisClient();
      if (!client) {
        throw new Error('Redis is required for RATE_LIMIT_STORE=redis but could not be initialized');
      }
      if (!redisLimiter) redisLimiter = new RateLimiterRedis({ storeClient: client, points: POINTS, duration: DURATION });
      return;
    }

    if (!memoryLimiter) memoryLimiter = new RateLimiterMemory({ points: POINTS, duration: DURATION });
  })();

  try {
    await limiterInitPromise;
  } finally {
    limiterInitPromise = null;
  }
}

export async function assertRateLimit(ip: string) {
  await ensureLimiter();
  const store = (process.env.RATE_LIMIT_STORE || 'memory') as 'memory' | 'redis';
  if (store === 'redis' && redisLimiter) {
    await redisLimiter.consume(ip);
    return;
  }

  if (memoryLimiter) {
    await memoryLimiter.consume(ip);
    return;
  }

  throw new Error('Rate limiter not initialized');
}
