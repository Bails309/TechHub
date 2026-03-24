import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────
vi.mock('../src/lib/prisma', () => ({
  prisma: {
    auditLog: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../src/lib/auth', () => ({
  getServerAuthSession: vi.fn(),
}));

import { prisma } from '../src/lib/prisma';
import { getServerAuthSession } from '../src/lib/auth';
import { getAuditDetails } from '../src/app/admin/audit/actions';

const mockSession = getServerAuthSession as ReturnType<typeof vi.fn>;

describe('getAuditDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.mockResolvedValue({ user: { id: 'admin-1', roles: ['admin'] } });
  });

  it('returns audit details for admin', async () => {
    const details = { ip: '1.2.3.4', action: 'login' };
    (prisma.auditLog.findUnique as any).mockResolvedValue({ details });

    const result = await getAuditDetails('audit-1');
    expect(result).toEqual(details);
    expect(prisma.auditLog.findUnique).toHaveBeenCalledWith({
      where: { id: 'audit-1' },
      select: { details: true },
    });
  });

  it('returns undefined when audit not found', async () => {
    (prisma.auditLog.findUnique as any).mockResolvedValue(null);
    const result = await getAuditDetails('missing');
    expect(result).toBeUndefined();
  });

  it('throws for non-admin user', async () => {
    mockSession.mockResolvedValue({ user: { id: 'u1', roles: ['viewer'] } });
    await expect(getAuditDetails('audit-1')).rejects.toThrow('Unauthorized');
  });

  it('throws for unauthenticated user', async () => {
    mockSession.mockResolvedValue(null);
    await expect(getAuditDetails('audit-1')).rejects.toThrow();
  });
});
