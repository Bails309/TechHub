import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('rate limiter (memory)', () => {
  it('allows up to configured points and then rejects', async () => {
    process.env.RATE_LIMIT_POINTS = '3';
    process.env.RATE_LIMIT_DURATION = '60';
    const { assertRateLimit } = await import('../src/lib/rateLimit');

    const key = 'test-ip-memory';
    await assertRateLimit(key);
    await assertRateLimit(key);
    await assertRateLimit(key);

    let errored = false;
    try {
      await assertRateLimit(key);
    } catch (err) {
      errored = true;
    }
    expect(errored).toBe(true);
  });
});

describe('rate limiter (redis)', () => {
  it('works with a redis-backed limiter', async () => {
    process.env.RATE_LIMIT_STORE = 'redis';
    process.env.RATE_LIMIT_POINTS = '3';
    process.env.RATE_LIMIT_DURATION = '60';

    // mock ioredis with ioredis-mock before importing the module
    vi.mock('ioredis', async () => await import('ioredis-mock'));
    const { assertRateLimit } = await import('../src/lib/rateLimit');

    const key = 'test-ip-redis';
    await assertRateLimit(key);
    await assertRateLimit(key);
    await assertRateLimit(key);
    let errored = false;
    try {
      await assertRateLimit(key);
    } catch (err) {
      errored = true;
    }
    expect(errored).toBe(true);
  });
});
