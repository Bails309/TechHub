import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

// ── Mocks ──────────────────────────────────────────────────────────────────
vi.mock('../src/lib/prisma', () => ({
  prisma: {
    appLink: { findMany: vi.fn() },
    userAppOrder: { upsert: vi.fn() },
  },
}));

vi.mock('../src/lib/auth', () => ({
  getServerAuthSession: vi.fn(),
}));

vi.mock('../src/lib/csrf', () => ({
  validateApiCsrf: vi.fn(),
}));

vi.mock('../src/lib/rateLimit', () => ({
  assertRateLimit: vi.fn(),
}));

import { prisma } from '../src/lib/prisma';
import { getServerAuthSession } from '../src/lib/auth';
import { validateApiCsrf } from '../src/lib/csrf';
import { POST } from '../src/app/api/app-order/route';

const mockSession = getServerAuthSession as ReturnType<typeof vi.fn>;
const mockCsrf = validateApiCsrf as ReturnType<typeof vi.fn>;

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/app-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/app-order', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCsrf.mockResolvedValue(true);
    mockSession.mockResolvedValue({ user: { id: 'u1', roles: ['viewer'] } });
    (prisma.appLink.findMany as any).mockResolvedValue([{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }]);
    (prisma.userAppOrder.upsert as any).mockResolvedValue({});
  });

  it('saves valid app order', async () => {
    const res = await POST(makeRequest({ order: ['a2', 'a1'] }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(prisma.userAppOrder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1' },
        update: { order: ['a2', 'a1'] },
        create: { userId: 'u1', order: ['a2', 'a1'] },
      }),
    );
  });

  it('filters out invalid IDs', async () => {
    await POST(makeRequest({ order: ['a1', 'invalid-id', 'a3'] }));
    expect(prisma.userAppOrder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { order: ['a1', 'a3'] },
      }),
    );
  });

  it('rejects CSRF failure', async () => {
    mockCsrf.mockResolvedValue(false);
    const res = await POST(makeRequest({ order: ['a1'] }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain('CSRF');
  });

  it('rejects unauthenticated request', async () => {
    mockSession.mockResolvedValue(null);
    const res = await POST(makeRequest({ order: ['a1'] }));
    expect(res.status).toBe(401);
  });

  it('rejects invalid JSON body', async () => {
    mockCsrf.mockResolvedValue(true);
    const req = new Request('http://localhost/api/app-order', {
      method: 'POST',
      body: 'not json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Invalid JSON');
  });

  it('rejects invalid payload shape', async () => {
    const res = await POST(makeRequest({ order: 123 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Invalid payload');
  });

  it('rejects empty strings in order array', async () => {
    const res = await POST(makeRequest({ order: ['', 'a1'] }));
    expect(res.status).toBe(400);
  });
});
