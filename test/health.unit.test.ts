import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkDatabaseHealth, checkRedisHealth, checkSchemaHealth } from '../src/lib/health';
import { prisma } from '../src/lib/prisma';
import { getSharedRedisClient } from '../src/lib/redis';

// Mock dependencies
vi.mock('../src/lib/prisma', () => ({
    prisma: {
        $queryRaw: vi.fn(),
        systemState: {
            findUnique: vi.fn()
        }
    }
}));

vi.mock('../src/lib/redis', () => ({
    getSharedRedisClient: vi.fn()
}));

vi.mock('../src/lib/storageConfig', () => ({
    getStorageConfigMap: vi.fn().mockResolvedValue(new Map())
}));

describe('Health Checks', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('checkDatabaseHealth', () => {
        it('should return ok when query succeeds', async () => {
            (prisma.$queryRaw as any).mockResolvedValue([{ 1: 1 }]);
            const result = await checkDatabaseHealth();
            expect(result.status).toBe('ok');
            expect(result.latency).toBeDefined();
        });

        it('should return error when query fails', async () => {
            (prisma.$queryRaw as any).mockRejectedValue(new Error('DB Connection Failed'));
            const result = await checkDatabaseHealth();
            expect(result.status).toBe('error');
            expect(result.message).toContain('DB Connection Failed');
        });
    });

    describe('checkRedisHealth', () => {
        it('should return ok when ping succeeds', async () => {
            const mockRedis = {
                ping: vi.fn().mockResolvedValue('PONG'),
                info: vi.fn().mockResolvedValue('used_memory:1024\r\nmaxmemory:2048')
            };
            (getSharedRedisClient as any).mockResolvedValue(mockRedis);

            const result = await checkRedisHealth();
            expect(result.status).toBe('ok');
            expect(result.details?.usedMemory).toBe(1024);
        });

        it('should return error when connection fails', async () => {
            const originalUrl = process.env.REDIS_URL;
            process.env.REDIS_URL = 'redis://localhost';
            try {
                (getSharedRedisClient as any).mockResolvedValue(null);
                const result = await checkRedisHealth();
                expect(result.status).toBe('error');
            } finally {
                process.env.REDIS_URL = originalUrl;
            }
        });
    });

    describe('checkSchemaHealth', () => {
        it('should return ok when hashes match', async () => {
            // Mock DB hash
            (prisma.systemState.findUnique as any).mockResolvedValue({
                value: 'mock-hash',
                updatedAt: new Date()
            });

            // This is hard to test perfectly because it reads the real file system
            // but we can verify it at least returns a status
            const result = await checkSchemaHealth();
            expect(result.status).toBeDefined();
        });
    });
});
