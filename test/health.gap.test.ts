import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const mockPrisma = {
  $queryRaw: vi.fn(),
  systemState: { findUnique: vi.fn() },
};
const mockGetSharedRedisClient = vi.fn();
const mockGetStorageConfigMap = vi.fn();

vi.mock('../src/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('../src/lib/redis', () => ({ getSharedRedisClient: (...a: any[]) => mockGetSharedRedisClient(...a) }));
vi.mock('../src/lib/storageConfig', () => ({ getStorageConfigMap: (...a: any[]) => mockGetStorageConfigMap(...a) }));

const { checkDatabaseHealth, checkRedisHealth, checkStorageHealth, checkSchemaHealth, getSystemHealth } = await import('../src/lib/health');

describe('health.ts – gap coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkStorageHealth', () => {
    it('returns warning when no storage provider is enabled', async () => {
      mockGetStorageConfigMap.mockResolvedValue(new Map());
      const result = await checkStorageHealth();
      expect(result.status).toBe('warning');
      expect(result.message).toContain('No storage provider');
    });

    it('returns ok for local storage', async () => {
      mockGetStorageConfigMap.mockResolvedValue(new Map([
        ['local', { provider: 'local', enabled: true, config: { path: '/data/uploads' } }]
      ]));
      const result = await checkStorageHealth();
      expect(result.status).toBe('ok');
      expect(result.details?.provider).toBe('Local Filesystem');
    });

    it('returns ok for S3 storage with details', async () => {
      mockGetStorageConfigMap.mockResolvedValue(new Map([
        ['s3', { provider: 's3', enabled: true, config: { bucket: 'my-bucket', region: 'us-east-1' } }]
      ]));
      const result = await checkStorageHealth();
      expect(result.status).toBe('ok');
      expect(result.details?.bucket).toBe('my-bucket');
      expect(result.details?.region).toBe('us-east-1');
    });

    it('returns ok for Azure storage with details', async () => {
      mockGetStorageConfigMap.mockResolvedValue(new Map([
        ['azure', { provider: 'azure', enabled: true, config: { containerName: 'icons', accountName: 'myaccount' } }]
      ]));
      const result = await checkStorageHealth();
      expect(result.status).toBe('ok');
      expect(result.details?.container).toBe('icons');
      expect(result.details?.account).toBe('myaccount');
    });

    it('returns error when getStorageConfigMap throws', async () => {
      mockGetStorageConfigMap.mockRejectedValue(new Error('Config DB down'));
      const result = await checkStorageHealth();
      expect(result.status).toBe('error');
      expect(result.message).toContain('Config DB down');
    });
  });

  describe('checkRedisHealth – maxmemory edge cases', () => {
    it('handles maxmemory=0 (unlimited) with total_system_memory fallback', async () => {
      const mockClient = {
        ping: vi.fn().mockResolvedValue('PONG'),
        info: vi.fn().mockResolvedValue('used_memory:5000000\nmaxmemory:0\ntotal_system_memory:16000000')
      };
      mockGetSharedRedisClient.mockResolvedValue(mockClient);
      const result = await checkRedisHealth();
      expect(result.status).toBe('ok');
      expect(result.details?.maxMemory).toBe(16000000);
    });
  });

  describe('checkSchemaHealth', () => {
    it('returns warning when schema hash mismatches', async () => {
      mockPrisma.systemState.findUnique.mockResolvedValue({ value: 'dead0000' });
      const result = await checkSchemaHealth();
      expect(result.status).toBe('warning');
      expect(result.message).toContain('out of sync');
    });

    it('returns warning when DB has no stored hash', async () => {
      mockPrisma.systemState.findUnique.mockResolvedValue(null);
      const result = await checkSchemaHealth();
      expect(result.status).toBe('warning');
      expect(result.message).toContain('Never synchronized');
    });
  });

  describe('getSystemHealth', () => {
    it('aggregates all health checks', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ 1: 1 }]);
      mockGetSharedRedisClient.mockResolvedValue(null);
      mockGetStorageConfigMap.mockResolvedValue(new Map());
      mockPrisma.systemState.findUnique.mockResolvedValue(null);

      const result = await getSystemHealth();
      expect(result).toHaveProperty('db');
      expect(result).toHaveProperty('redis');
      expect(result).toHaveProperty('storage');
      expect(result).toHaveProperty('schema');
    });
  });
});
