import { describe, it, expect, beforeEach } from 'vitest';

describe('rate limiter (memory)', async () => {
  // set small limits for tests
  process.env.RATE_LIMIT_POINTS = '3';
  process.env.RATE_LIMIT_DURATION = '60';
  // import after env set
  const { assertRateLimit } = await import('../src/lib/rateLimit');

  it('allows up to configured points and then rejects', async () => {
    const key = 'test-ip-memory';
    // consume points
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

describe('rate limiter (redis)', async () => {
  // mock ioredis with ioredis-mock and enable redis mode
  process.env.RATE_LIMIT_STORE = 'redis';
  process.env.RATE_LIMIT_POINTS = '3';
  process.env.RATE_LIMIT_DURATION = '60';

  // ensure the mocked module is used by the rateLimit module
  const vi = await import('vitest');
  const im = await import('ioredis-mock');
  // mock 'ioredis' to return ioredis-mock
  vi.vi?.mock('ioredis', () => im);

  const { assertRateLimit } = await import('../src/lib/rateLimit');

  it('works with a redis-backed limiter', async () => {
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
