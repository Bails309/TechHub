import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRedis = vi.hoisted(() => ({
  zadd: vi.fn().mockResolvedValue(1),
  zcard: vi.fn().mockResolvedValue(1),
  del: vi.fn().mockResolvedValue(1),
  ping: vi.fn().mockResolvedValue('PONG'),
  info: vi.fn().mockResolvedValue('used_memory:1000000\nmaxmemory:16000000'),
}));

const mockGetSharedRedisClient = vi.fn().mockResolvedValue(mockRedis);
const mockPrisma = {
  $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
  systemState: { findUnique: vi.fn().mockResolvedValue(null) },
};
const mockGetStorageConfigMap = vi.fn().mockResolvedValue(new Map());

vi.mock('../src/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('../src/lib/redis', () => ({ getSharedRedisClient: (...a: any[]) => mockGetSharedRedisClient(...a) }));
vi.mock('../src/lib/storageConfig', () => ({ getStorageConfigMap: (...a: any[]) => mockGetStorageConfigMap(...a) }));

const { checkSessionTrackingHealth, checkSchemaHealth } = await import('../src/lib/health');

describe('health.ts – session tracking & schema gap coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkSessionTrackingHealth', () => {
    it('returns ok when Redis sorted-set operations succeed', async () => {
      mockRedis.zcard.mockResolvedValue(1);
      const result = await checkSessionTrackingHealth();
      expect(result.status).toBe('ok');
      expect(result.message).toContain('functional');
      expect(result.latency).toBeGreaterThanOrEqual(0);
      expect(mockRedis.zadd).toHaveBeenCalled();
      expect(mockRedis.zcard).toHaveBeenCalled();
      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('returns error when Redis is unavailable', async () => {
      mockGetSharedRedisClient.mockResolvedValueOnce(null);
      const result = await checkSessionTrackingHealth();
      expect(result.status).toBe('error');
      expect(result.message).toContain('Redis unavailable');
    });

    it('returns error when ZADD/ZCARD returns unexpected count', async () => {
      mockRedis.zcard.mockResolvedValue(0);
      const result = await checkSessionTrackingHealth();
      expect(result.status).toBe('error');
      expect(result.message).toContain('unexpected count');
    });

    it('returns error when Redis operation throws', async () => {
      mockRedis.zadd.mockRejectedValueOnce(new Error('CLUSTERDOWN'));
      const result = await checkSessionTrackingHealth();
      expect(result.status).toBe('error');
      expect(result.message).toContain('CLUSTERDOWN');
      expect(result.latency).toBeGreaterThanOrEqual(0);
    });

    it('returns error with non-Error thrown value', async () => {
      mockRedis.zadd.mockRejectedValueOnce('unknown failure');
      const result = await checkSessionTrackingHealth();
      expect(result.status).toBe('error');
      expect(result.message).toBe('unknown failure');
    });
  });

  describe('checkSchemaHealth error path', () => {
    it('returns error when DB throws', async () => {
      mockPrisma.systemState.findUnique.mockRejectedValueOnce(new Error('Connection refused'));
      const result = await checkSchemaHealth();
      expect(result.status).toBe('error');
      expect(result.message).toContain('Connection refused');
    });

    it('returns error with non-Error thrown value', async () => {
      mockPrisma.systemState.findUnique.mockRejectedValueOnce('timeout');
      const result = await checkSchemaHealth();
      expect(result.status).toBe('error');
      expect(result.message).toBe('timeout');
    });
  });
});
