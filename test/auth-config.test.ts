import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('auth-config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getSessionMaxAgeSeconds', () => {
    it('returns 28800 (8h) by default', async () => {
      delete process.env.SESSION_MAX_AGE_SECONDS;
      const { getSessionMaxAgeSeconds } = await import('../src/lib/auth-config');
      expect(getSessionMaxAgeSeconds()).toBe(28800);
    });

    it('respects SESSION_MAX_AGE_SECONDS env var', async () => {
      process.env.SESSION_MAX_AGE_SECONDS = '3600';
      const { getSessionMaxAgeSeconds } = await import('../src/lib/auth-config');
      expect(getSessionMaxAgeSeconds()).toBe(3600);
    });

    it('falls back to default for non-positive value', async () => {
      process.env.SESSION_MAX_AGE_SECONDS = '0';
      const { getSessionMaxAgeSeconds } = await import('../src/lib/auth-config');
      expect(getSessionMaxAgeSeconds()).toBe(28800);
    });

    it('falls back to default for negative value', async () => {
      process.env.SESSION_MAX_AGE_SECONDS = '-100';
      const { getSessionMaxAgeSeconds } = await import('../src/lib/auth-config');
      expect(getSessionMaxAgeSeconds()).toBe(28800);
    });

    it('falls back to default for non-numeric value', async () => {
      process.env.SESSION_MAX_AGE_SECONDS = 'abc';
      const { getSessionMaxAgeSeconds } = await import('../src/lib/auth-config');
      expect(getSessionMaxAgeSeconds()).toBe(28800);
    });
  });

  describe('getSessionIdleTimeoutMs', () => {
    it('returns 1200000 (20min) by default', async () => {
      delete process.env.SESSION_IDLE_TIMEOUT_MS;
      const { getSessionIdleTimeoutMs } = await import('../src/lib/auth-config');
      expect(getSessionIdleTimeoutMs()).toBe(1200000);
    });

    it('respects SESSION_IDLE_TIMEOUT_MS env var', async () => {
      process.env.SESSION_IDLE_TIMEOUT_MS = '300000';
      const { getSessionIdleTimeoutMs } = await import('../src/lib/auth-config');
      expect(getSessionIdleTimeoutMs()).toBe(300000);
    });

    it('falls back to default for zero', async () => {
      process.env.SESSION_IDLE_TIMEOUT_MS = '0';
      const { getSessionIdleTimeoutMs } = await import('../src/lib/auth-config');
      expect(getSessionIdleTimeoutMs()).toBe(1200000);
    });

    it('falls back to default for negative value', async () => {
      process.env.SESSION_IDLE_TIMEOUT_MS = '-500';
      const { getSessionIdleTimeoutMs } = await import('../src/lib/auth-config');
      expect(getSessionIdleTimeoutMs()).toBe(1200000);
    });
  });
});
