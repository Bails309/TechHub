import { RateLimiterMemory, RateLimiterRedis } from 'rate-limiter-flexible';
import IORedis from 'ioredis';

const POINTS = Number(process.env.RATE_LIMIT_POINTS || '10');
const DURATION = Number(process.env.RATE_LIMIT_DURATION || '60');

let memoryLimiter: RateLimiterMemory | null = null;
let redisLimiter: RateLimiterRedis | null = null;

async function ensureLimiter() {
  const store = (process.env.RATE_LIMIT_STORE || 'memory') as 'memory' | 'redis';
  // In production serverless environments the in-memory limiter is ineffective
  // because instances do not share memory. Require Redis in production to
  // ensure rate limits are enforced across all instances.
  if (process.env.NODE_ENV === 'production' && store !== 'redis') {
    // Warn in production that the memory store is ineffective in distributed
    // serverless environments. Operators should set RATE_LIMIT_STORE=redis and
    // provide REDIS_URL. We avoid throwing here to prevent hard failures in
    // CI or environments where redis is intentionally not provided.
    //
    // If you prefer stricter enforcement, change this to throw an Error.
    // eslint-disable-next-line no-console
    console.warn(
      'SECURITY: RATE_LIMIT_STORE is not set to "redis" in production. Memory-based rate limiting is ineffective in serverless/distributed environments.'
    );
  }
  if (store === 'redis') {
    if (redisLimiter) return;
    const redisClient = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');
    redisLimiter = new RateLimiterRedis({ storeClient: redisClient, points: POINTS, duration: DURATION });
  } else {
    if (memoryLimiter) return;
    memoryLimiter = new RateLimiterMemory({ points: POINTS, duration: DURATION });
  }
}

export async function assertRateLimit(ip: string) {
  await ensureLimiter();
  const store = (process.env.RATE_LIMIT_STORE || 'memory') as 'memory' | 'redis';
  if (store === 'redis') {
    if (!redisLimiter) throw new Error('Redis limiter not initialized');
    await redisLimiter.consume(ip);
  } else {
    if (!memoryLimiter) throw new Error('Memory limiter not initialized');
    await memoryLimiter.consume(ip);
  }
}
