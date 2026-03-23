import { describe, it, expect, vi, beforeEach } from 'vitest';

// -------------------------------------------------------------------
// Cron Cleanup Route – /api/cron/cleanup
// -------------------------------------------------------------------

vi.mock('../src/lib/storage', () => ({
  cleanupOrphanedIcons: vi.fn(),
}));

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    appLink: { findMany: vi.fn() },
    siteConfig: { findMany: vi.fn() },
  },
}));

vi.mock('../src/lib/audit', () => ({
  writeAuditLog: vi.fn(),
}));

import { prisma } from '../src/lib/prisma';
import { cleanupOrphanedIcons } from '../src/lib/storage';
import { POST } from '../src/app/api/cron/cleanup/route';

const mockApps = prisma.appLink.findMany as ReturnType<typeof vi.fn>;
const mockSiteConfigs = prisma.siteConfig.findMany as ReturnType<typeof vi.fn>;
const mockCleanup = cleanupOrphanedIcons as ReturnType<typeof vi.fn>;

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/cron/cleanup', {
    method: 'POST',
    headers,
  });
}

describe('POST /api/cron/cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CRON_SECRET;
  });

  it('runs cleanup and returns deletedCount', async () => {
    mockApps.mockResolvedValue([{ icon: '/uploads/a.png' }]);
    mockSiteConfigs.mockResolvedValue([{ logoLight: '/uploads/logo.png', logoDark: null, faviconUrl: null, logo: null }]);
    mockCleanup.mockResolvedValue(3);

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, deletedCount: 3 });
  });

  it('rejects when CRON_SECRET is set but header is wrong', async () => {
    process.env.CRON_SECRET = 'my-secret';
    const res = await POST(makeRequest({ authorization: 'Bearer wrong' }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('accepts correct Bearer token when CRON_SECRET is set', async () => {
    process.env.CRON_SECRET = 'my-secret';
    mockApps.mockResolvedValue([]);
    mockSiteConfigs.mockResolvedValue([]);
    mockCleanup.mockResolvedValue(0);

    const res = await POST(makeRequest({ authorization: 'Bearer my-secret' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 500 on internal error', async () => {
    mockApps.mockRejectedValue(new Error('DB down'));

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe('Internal Server Error');
  });
});
