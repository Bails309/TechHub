import { RateLimiterMemory, RateLimiterRedis } from 'rate-limiter-flexible';
import IORedis from 'ioredis';

const POINTS = Number(process.env.RATE_LIMIT_POINTS || '10');
const DURATION = Number(process.env.RATE_LIMIT_DURATION || '60');

let memoryLimiter: RateLimiterMemory | null = null;
let redisLimiter: RateLimiterRedis | null = null;

async function ensureLimiter() {
  const store = (process.env.RATE_LIMIT_STORE || 'memory') as 'memory' | 'redis';
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
