import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Redis client
// ---------------------------------------------------------------------------
const mockRedis = vi.hoisted(() => ({
  zadd: vi.fn().mockResolvedValue(1),
  zrem: vi.fn().mockResolvedValue(1),
  zcard: vi.fn().mockResolvedValue(0),
  zremrangebyscore: vi.fn().mockResolvedValue(0),
  expire: vi.fn().mockResolvedValue(1),
  zscore: vi.fn().mockResolvedValue(null),
  del: vi.fn().mockResolvedValue(1),
  zrange: vi.fn().mockResolvedValue([]),
}));

vi.mock('../src/lib/redis', () => ({
  getSharedRedisClient: vi.fn().mockResolvedValue(mockRedis),
}));

vi.mock('../src/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(null),
}));

import { getSessionEntries, clearAllSessions } from '../src/lib/sessionTracker';
import { getSharedRedisClient } from '../src/lib/redis';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sessionTracker.ts – gap coverage', () => {
  describe('getSessionEntries', () => {
    it('returns parsed entries from Redis sorted set', async () => {
      const now = Date.now();
      const score1 = now + 60_000;
      const score2 = now + 120_000;
      mockRedis.zrange.mockResolvedValue([
        'session-abc', String(score1),
        'session-def', String(score2),
      ]);

      const entries = await getSessionEntries('user-1');

      expect(mockRedis.zrange).toHaveBeenCalledWith(
        'sessions:user-1', 0, -1, 'WITHSCORES'
      );
      expect(entries).toHaveLength(2);
      expect(entries[0].jti).toBe('session-abc');
      expect(entries[0].score).toBe(score1);
      expect(entries[0].expiresIn).toBeGreaterThan(0);
      expect(entries[1].jti).toBe('session-def');
    });

    it('returns empty array when Redis is unavailable', async () => {
      vi.mocked(getSharedRedisClient).mockResolvedValueOnce(null);
      const entries = await getSessionEntries('user-1');
      expect(entries).toEqual([]);
    });

    it('returns empty array on Redis error', async () => {
      mockRedis.zrange.mockRejectedValueOnce(new Error('CLUSTERDOWN'));
      const entries = await getSessionEntries('user-1');
      expect(entries).toEqual([]);
    });

    it('handles empty sorted set', async () => {
      mockRedis.zrange.mockResolvedValue([]);
      const entries = await getSessionEntries('user-1');
      expect(entries).toEqual([]);
    });

    it('returns negative expiresIn for already-expired entries', async () => {
      const pastScore = Date.now() - 30_000;
      mockRedis.zrange.mockResolvedValue(['old-session', String(pastScore)]);
      const entries = await getSessionEntries('user-1');
      expect(entries).toHaveLength(1);
      expect(entries[0].expiresIn).toBeLessThan(0);
    });
  });

  describe('clearAllSessions', () => {
    it('deletes all sessions and returns count', async () => {
      mockRedis.zcard.mockResolvedValue(3);
      const removed = await clearAllSessions('user-1');
      expect(mockRedis.zcard).toHaveBeenCalledWith('sessions:user-1');
      expect(mockRedis.del).toHaveBeenCalledWith('sessions:user-1');
      expect(removed).toBe(3);
    });

    it('returns 0 when Redis is unavailable', async () => {
      vi.mocked(getSharedRedisClient).mockResolvedValueOnce(null);
      const removed = await clearAllSessions('user-1');
      expect(removed).toBe(0);
    });

    it('returns 0 on Redis error', async () => {
      mockRedis.zcard.mockRejectedValueOnce(new Error('READONLY'));
      const removed = await clearAllSessions('user-1');
      expect(removed).toBe(0);
    });

    it('returns 0 when no sessions exist', async () => {
      mockRedis.zcard.mockResolvedValue(0);
      const removed = await clearAllSessions('user-1');
      expect(removed).toBe(0);
      expect(mockRedis.del).toHaveBeenCalled();
    });
  });
});
