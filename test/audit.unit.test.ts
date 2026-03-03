import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeAuditLog, getAverageLatency } from '../src/lib/audit';
import { prisma } from '../src/lib/prisma';
import { getServerActionIp } from '../src/lib/ip';

// Mock dependencies
vi.mock('../src/lib/prisma', () => ({
    prisma: {
        auditLog: {
            create: vi.fn(),
            deleteMany: vi.fn(),
            findMany: vi.fn()
        }
    }
}));

vi.mock('../src/lib/ip', () => ({
    getServerActionIp: vi.fn().mockResolvedValue('127.0.0.1')
}));

describe('Audit Logging', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('writeAuditLog', () => {
        it('should successfully create an audit log entry', async () => {
            const mockEntry = {
                category: 'auth' as const,
                action: 'login_success',
                actorId: 'user-123',
                ip: '10.0.0.1'
            };

            (prisma.auditLog.create as any).mockResolvedValue({ id: 'log-1', ...mockEntry });

            const result = await writeAuditLog(mockEntry);

            expect(result).toBeDefined();
            expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    action: 'login_success',
                    ip: '10.0.0.1'
                })
            }));
        });

        it('should capture IP automatically if missing', async () => {
            const mockEntry = {
                category: 'admin' as const,
                action: 'update_settings',
                actorId: 'admin-1'
            };

            (prisma.auditLog.create as any).mockResolvedValue({ id: 'log-2', ...mockEntry });
            (getServerActionIp as any).mockResolvedValue('192.168.1.1');

            await writeAuditLog(mockEntry);

            expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    ip: '192.168.1.1'
                })
            }));
        });

        it('should handle errors gracefully and return null', async () => {
            (prisma.auditLog.create as any).mockRejectedValue(new Error('Database error'));

            const result = await writeAuditLog({ category: 'auth', action: 'test' });

            expect(result).toBeNull();
        });
    });

    describe('getAverageLatency', () => {
        it('should calculate the correct average', async () => {
            (prisma.auditLog.findMany as any).mockResolvedValue([
                { latency: 100 },
                { latency: 200 },
                { latency: 300 }
            ]);

            const average = await getAverageLatency();
            expect(average).toBe(200);
        });

        it('should return null if no logs found', async () => {
            (prisma.auditLog.findMany as any).mockResolvedValue([]);
            const average = await getAverageLatency();
            expect(average).toBeNull();
        });
    });
});
