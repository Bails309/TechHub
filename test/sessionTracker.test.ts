import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Redis client — vi.hoisted ensures the object exists when vi.mock runs
// ---------------------------------------------------------------------------
const mockRedis = vi.hoisted(() => ({
  zadd: vi.fn().mockResolvedValue(1),
  zrem: vi.fn().mockResolvedValue(1),
  zcard: vi.fn().mockResolvedValue(0),
  zremrangebyscore: vi.fn().mockResolvedValue(0),
  expire: vi.fn().mockResolvedValue(1),
}));

vi.mock('../src/lib/redis', () => ({
  getSharedRedisClient: vi.fn().mockResolvedValue(mockRedis),
}));

vi.mock('../src/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(null),
}));

import { trackSession, untrackSession, countActiveSessions } from '../src/lib/sessionTracker';
import { writeAuditLog } from '../src/lib/audit';

beforeEach(() => {
  vi.clearAllMocks();
  mockRedis.zcard.mockResolvedValue(0);
});

describe('sessionTracker', () => {
  // -----------------------------------------------------------------------
  // trackSession
  // -----------------------------------------------------------------------
  describe('trackSession', () => {
    it('registers a session in the Redis sorted set', async () => {
      const expires = Date.now() + 3600_000;
      const count = await trackSession('user-1', 'jti-abc', expires, '10.0.0.1', 'credentials');

      expect(mockRedis.zremrangebyscore).toHaveBeenCalledWith(
        'sessions:user-1',
        '-inf',
        expect.any(String),
      );
      expect(mockRedis.zadd).toHaveBeenCalledWith(
        'sessions:user-1',
        String(expires),
        'jti-abc',
      );
      expect(mockRedis.expire).toHaveBeenCalled();
      expect(count).toBe(1);
    });

    it('logs concurrent_login_detected when another session already exists', async () => {
      mockRedis.zcard.mockResolvedValue(1); // 1 existing session

      const count = await trackSession('user-1', 'jti-def', Date.now() + 3600_000, '10.0.0.2', 'credentials');

      expect(count).toBe(2);
      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'auth',
          action: 'concurrent_login_detected',
          actorId: 'user-1',
          details: { activeSessions: 2 },
        }),
      );
    });

    it('does NOT log concurrent_login_detected for the first session', async () => {
      mockRedis.zcard.mockResolvedValue(0);

      await trackSession('user-1', 'jti-first', Date.now() + 3600_000);
      expect(writeAuditLog).not.toHaveBeenCalled();
    });

    it('returns 0 when Redis is unavailable', async () => {
      const { getSharedRedisClient } = await import('../src/lib/redis');
      (getSharedRedisClient as any).mockResolvedValueOnce(null);

      const count = await trackSession('user-1', 'jti-x', Date.now() + 1000);
      expect(count).toBe(0);
    });

    it('handles Redis errors gracefully', async () => {
      mockRedis.zremrangebyscore.mockRejectedValueOnce(new Error('REDIS DOWN'));

      const count = await trackSession('user-1', 'jti-err', Date.now() + 1000);
      expect(count).toBe(0); // graceful fallback
    });
  });

  // -----------------------------------------------------------------------
  // untrackSession
  // -----------------------------------------------------------------------
  describe('untrackSession', () => {
    it('removes the JTI from the sorted set', async () => {
      await untrackSession('user-1', 'jti-abc');

      expect(mockRedis.zrem).toHaveBeenCalledWith('sessions:user-1', 'jti-abc');
    });

    it('handles Redis unavailability silently', async () => {
      const { getSharedRedisClient } = await import('../src/lib/redis');
      (getSharedRedisClient as any).mockResolvedValueOnce(null);

      await expect(untrackSession('user-1', 'jti-x')).resolves.toBeUndefined();
    });

    it('handles Redis errors gracefully', async () => {
      mockRedis.zrem.mockRejectedValueOnce(new Error('REDIS DOWN'));

      await expect(untrackSession('user-1', 'jti-x')).resolves.toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // countActiveSessions
  // -----------------------------------------------------------------------
  describe('countActiveSessions', () => {
    it('prunes expired entries and returns the count', async () => {
      mockRedis.zcard.mockResolvedValue(3);

      const count = await countActiveSessions('user-1');

      expect(mockRedis.zremrangebyscore).toHaveBeenCalledWith(
        'sessions:user-1',
        '-inf',
        expect.any(String),
      );
      expect(count).toBe(3);
    });

    it('returns 0 when Redis is unavailable', async () => {
      const { getSharedRedisClient } = await import('../src/lib/redis');
      (getSharedRedisClient as any).mockResolvedValueOnce(null);

      expect(await countActiveSessions('user-1')).toBe(0);
    });

    it('returns 0 on Redis error', async () => {
      mockRedis.zcard.mockRejectedValueOnce(new Error('REDIS DOWN'));

      expect(await countActiveSessions('user-1')).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------
  describe('edge cases', () => {
    it('skips expire call when TTL is non-positive (far-past expiry)', async () => {
      // TTL calc: Math.ceil((expiresAtMs - now) / 1000) + 60. Needs to be <= 0.
      // So expiresAtMs must be > 60s in the past.
      const farPastExpiry = Date.now() - 120_000;
      await trackSession('user-1', 'jti-past', farPastExpiry);
      expect(mockRedis.expire).not.toHaveBeenCalled();
    });

    it('handles many concurrent sessions (high count)', async () => {
      mockRedis.zcard.mockResolvedValue(9); // 9 existing
      const count = await trackSession('user-1', 'jti-10th', Date.now() + 3600_000);
      expect(count).toBe(10);
      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'concurrent_login_detected',
          details: { activeSessions: 10 },
        }),
      );
    });

    it('passes IP and provider correctly to audit log', async () => {
      mockRedis.zcard.mockResolvedValue(1);
      await trackSession('user-1', 'jti-audit', Date.now() + 3600_000, '192.168.1.1', 'azure-ad');
      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          ip: '192.168.1.1',
          provider: 'azure-ad',
        }),
      );
    });

    it('passes undefined ip/provider when not supplied', async () => {
      mockRedis.zcard.mockResolvedValue(1);
      await trackSession('user-1', 'jti-no-ip', Date.now() + 3600_000, null, null);
      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          ip: undefined,
          provider: undefined,
        }),
      );
    });

    it('uses correct Redis key prefix', async () => {
      await trackSession('uid-abc', 'jti-key', Date.now() + 3600_000);
      expect(mockRedis.zadd).toHaveBeenCalledWith(
        'sessions:uid-abc',
        expect.any(String),
        'jti-key',
      );
    });
  });
});
