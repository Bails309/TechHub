import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindMany = vi.fn();
const mockDeleteMany = vi.fn();
const mockCreate = vi.fn();

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    auditLog: {
      create: (...a: any[]) => mockCreate(...a),
      deleteMany: (...a: any[]) => mockDeleteMany(...a),
      findMany: (...a: any[]) => mockFindMany(...a),
    }
  }
}));

vi.mock('../src/lib/ip', () => ({
  getServerActionIp: vi.fn().mockResolvedValue('1.2.3.4')
}));

describe('audit.ts – gap coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getAverageLatency applies custom limit parameter', async () => {
    const { getAverageLatency } = await import('../src/lib/audit');
    mockFindMany.mockResolvedValue([
      { latency: 100 },
      { latency: 200 },
    ]);
    const avg = await getAverageLatency(10);
    expect(avg).toBe(150);
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 10,
    }));
  });

  it('getAverageLatency returns null on DB error', async () => {
    const { getAverageLatency } = await import('../src/lib/audit');
    mockFindMany.mockRejectedValue(new Error('DB error'));
    const avg = await getAverageLatency();
    expect(avg).toBeNull();
  });

  it('writeAuditLog includes details and userAgent', async () => {
    const { writeAuditLog } = await import('../src/lib/audit');
    mockCreate.mockResolvedValue({ id: '1' });

    const result = await writeAuditLog({
      category: 'config',
      action: 'storage_updated',
      details: { provider: 's3', bucket: 'test' },
    });
    expect(result).toEqual({ id: '1' });
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'storage_updated',
        details: { provider: 's3', bucket: 'test' },
      })
    });
  });

  it('writeAuditLog handles all category types', async () => {
    const { writeAuditLog } = await import('../src/lib/audit');
    mockCreate.mockResolvedValue({ id: '1' });

    for (const category of ['auth', 'admin', 'config', 'user'] as const) {
      await writeAuditLog({ category, action: 'test_action' });
    }
    expect(mockCreate).toHaveBeenCalledTimes(4);
  });
});
