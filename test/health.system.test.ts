import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all external dependencies
vi.mock('../src/lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    systemState: { findUnique: vi.fn() },
  },
}));

vi.mock('../src/lib/redis', () => ({
  getSharedRedisClient: vi.fn(),
}));

vi.mock('../src/lib/storageConfig', () => ({
  getStorageConfigMap: vi.fn(),
}));

// Mock fs for schema health
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn(),
      readFileSync: vi.fn(),
    },
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

import { prisma } from '../src/lib/prisma';
import { getSharedRedisClient } from '../src/lib/redis';
import { getStorageConfigMap } from '../src/lib/storageConfig';
import {
  checkDatabaseHealth,
  checkRedisHealth,
  checkStorageHealth,
  getSystemHealth,
} from '../src/lib/health';

const mockQueryRaw = prisma.$queryRaw as ReturnType<typeof vi.fn>;
const mockRedisClient = getSharedRedisClient as ReturnType<typeof vi.fn>;
const mockStorageConfig = getStorageConfigMap as ReturnType<typeof vi.fn>;

describe('Health checks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkDatabaseHealth', () => {
    it('returns ok when DB is reachable', async () => {
      mockQueryRaw.mockResolvedValue([{ '?column?': 1 }]);

      const result = await checkDatabaseHealth();

      expect(result.status).toBe('ok');
      expect(result.latency).toBeTypeOf('number');
    });

    it('returns error when DB throws', async () => {
      mockQueryRaw.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await checkDatabaseHealth();

      expect(result.status).toBe('error');
      expect(result.message).toContain('ECONNREFUSED');
    });
  });

  describe('checkRedisHealth', () => {
    it('returns ok when Redis is available and responds to ping', async () => {
      const fakeClient = {
        ping: vi.fn().mockResolvedValue('PONG'),
        info: vi.fn().mockResolvedValue('used_memory:1024\r\nmaxmemory:4096\r\n'),
      };
      mockRedisClient.mockResolvedValue(fakeClient);

      const result = await checkRedisHealth();

      expect(result.status).toBe('ok');
      expect(result.latency).toBeTypeOf('number');
      expect(result.details?.usedMemory).toBe(1024);
      expect(result.details?.maxMemory).toBe(4096);
    });

    it('returns warning when Redis URL is not configured (non-production)', async () => {
      const origUrl = process.env.REDIS_URL;
      const origEnv = process.env.NODE_ENV;
      delete process.env.REDIS_URL;
      process.env.NODE_ENV = 'test';
      mockRedisClient.mockResolvedValue(null);

      const result = await checkRedisHealth();

      expect(result.status).toBe('warning');
      expect(result.message).toContain('not configured');

      // Restore
      if (origUrl) process.env.REDIS_URL = origUrl;
      process.env.NODE_ENV = origEnv ?? 'test';
    });

    it('returns error when Redis client throws', async () => {
      mockRedisClient.mockRejectedValue(new Error('Redis timeout'));

      const result = await checkRedisHealth();

      expect(result.status).toBe('error');
      expect(result.message).toContain('Redis timeout');
    });
  });

  describe('checkStorageHealth', () => {
    it('returns ok with local storage details', async () => {
      const configs = new Map([
        ['local', { enabled: true, provider: 'local', config: { path: '/data/uploads' } }],
      ]);
      mockStorageConfig.mockResolvedValue(configs);

      const result = await checkStorageHealth();

      expect(result.status).toBe('ok');
      expect(result.message).toContain('Local Filesystem');
      expect(result.details?.path).toBe('/data/uploads');
    });

    it('returns ok with S3 storage details', async () => {
      const configs = new Map([
        ['s3', { enabled: true, provider: 's3', config: { bucket: 'my-bucket', region: 'us-east-1' } }],
      ]);
      mockStorageConfig.mockResolvedValue(configs);

      const result = await checkStorageHealth();

      expect(result.status).toBe('ok');
      expect(result.details?.bucket).toBe('my-bucket');
      expect(result.details?.region).toBe('us-east-1');
    });

    it('returns ok with Azure storage details', async () => {
      const configs = new Map([
        ['azure', { enabled: true, provider: 'azure', config: { containerName: 'icons', accountName: 'myaccount' } }],
      ]);
      mockStorageConfig.mockResolvedValue(configs);

      const result = await checkStorageHealth();

      expect(result.status).toBe('ok');
      expect(result.details?.container).toBe('icons');
      expect(result.details?.account).toBe('myaccount');
    });

    it('returns warning when no provider is enabled', async () => {
      mockStorageConfig.mockResolvedValue(new Map());

      const result = await checkStorageHealth();

      expect(result.status).toBe('warning');
      expect(result.message).toContain('No storage provider');
    });

    it('returns error when getStorageConfigMap throws', async () => {
      mockStorageConfig.mockRejectedValue(new Error('config load failed'));

      const result = await checkStorageHealth();

      expect(result.status).toBe('error');
      expect(result.message).toContain('config load failed');
    });
  });

  describe('getSystemHealth', () => {
    it('aggregates all health checks and server info', async () => {
      mockQueryRaw.mockResolvedValue([{ '?column?': 1 }]);
      mockRedisClient.mockResolvedValue(null);
      mockStorageConfig.mockResolvedValue(new Map([
        ['local', { enabled: true, provider: 'local', config: {} }],
      ]));
      // Mock systemState for schema check
      (prisma.systemState as any).findUnique = vi.fn().mockResolvedValue(null);

      const result = await getSystemHealth();

      expect(result.db).toBeDefined();
      expect(result.redis).toBeDefined();
      expect(result.storage).toBeDefined();
      expect(result.schema).toBeDefined();
      expect(result.timestamp).toBeDefined();
      expect(result.server.nodeVersion).toBe(process.version);
      expect(result.server.platform).toBe(process.platform);
      expect(result.server.uptime).toBeTypeOf('number');
    });
  });
});
