import { RateLimiterMemory, RateLimiterRedis } from 'rate-limiter-flexible';
import IORedis, { RedisOptions } from 'ioredis';

const POINTS = Number(process.env.RATE_LIMIT_POINTS || '10');
const DURATION = Number(process.env.RATE_LIMIT_DURATION || '60');

let memoryLimiter: RateLimiterMemory | null = null;
let redisLimiter: RateLimiterRedis | null = null;

let redisClient: IORedis | null = null;
let redisInitPromise: Promise<IORedis | null> | null = null;
let limiterInitPromise: Promise<void> | null = null;

async function initRedisClient(): Promise<IORedis | null> {
  if (redisClient) return redisClient;
  if (redisInitPromise) return redisInitPromise;

  const url = process.env.REDIS_URL ?? '';
  if (!url && process.env.NODE_ENV === 'production') {
    throw new Error('REDIS_URL must be set when using Redis in production');
  }

  redisInitPromise = (async () => {
    const opts: RedisOptions = {};
    if (process.env.REDIS_PASSWORD) opts.password = process.env.REDIS_PASSWORD;
    if (process.env.REDIS_TLS === 'true') opts.tls = {} as RedisOptions['tls'];
    try {
      const client = url ? new IORedis(url, opts) : new IORedis();
      client.on('error', () => {});
      // quick health check
      await client.ping();
      redisClient = client;
      return redisClient;
    } catch {
      try {
        if (redisClient) await redisClient.disconnect();
      } catch {}
      redisClient = null;
      if (process.env.NODE_ENV === 'production') return null;
      // In non-production allow returning null so tests can fallback or mock
      return null;
    } finally {
      redisInitPromise = null;
    }
  })();

  return redisInitPromise;
}

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
      const client = await initRedisClient();
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
