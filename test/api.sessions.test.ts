import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────
vi.mock('../src/lib/auth', () => ({
  getServerAuthSession: vi.fn(),
}));

const mockGetSessionEntries = vi.fn();
vi.mock('../src/lib/sessionTracker', () => ({
  getSessionEntries: (...a: any[]) => mockGetSessionEntries(...a),
}));

import { getServerAuthSession } from '../src/lib/auth';
import { GET } from '../src/app/api/sessions/route';

const mockSession = getServerAuthSession as ReturnType<typeof vi.fn>;

describe('GET /api/sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 for unauthenticated users', async () => {
    mockSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Forbidden');
  });

  it('returns 403 for non-admin users', async () => {
    mockSession.mockResolvedValue({
      user: { id: 'u1', roles: ['viewer'] },
    });
    const res = await GET();
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Forbidden');
  });

  it('returns session entries for admin users', async () => {
    const now = Date.now();
    mockSession.mockResolvedValue({
      user: { id: 'admin-1', roles: ['admin'] },
    });
    mockGetSessionEntries.mockResolvedValue([
      { jti: 'sess-a', score: now + 60_000, expiresIn: 60_000 },
      { jti: 'sess-b', score: now + 120_000, expiresIn: 120_000 },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.userId).toBe('admin-1');
    expect(json.count).toBe(2);
    expect(json.entries).toHaveLength(2);
    expect(json.entries[0].jti).toBe('sess-a');
    expect(json.now).toBeGreaterThan(0);
    expect(mockGetSessionEntries).toHaveBeenCalledWith('admin-1');
  });

  it('returns empty entries when no active sessions', async () => {
    mockSession.mockResolvedValue({
      user: { id: 'admin-1', roles: ['admin'] },
    });
    mockGetSessionEntries.mockResolvedValue([]);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.count).toBe(0);
    expect(json.entries).toEqual([]);
  });

  it('returns 403 when session has no roles array', async () => {
    mockSession.mockResolvedValue({
      user: { id: 'u1' },
    });
    const res = await GET();
    expect(res.status).toBe(403);
  });
});
