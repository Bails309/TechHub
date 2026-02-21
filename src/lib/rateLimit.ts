import { RateLimiterMemory } from 'rate-limiter-flexible';

const limiter = new RateLimiterMemory({
  points: 10,
  duration: 60
});

export async function assertRateLimit(ip: string) {
  await limiter.consume(ip);
}
