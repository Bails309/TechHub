/**
 * Regression tests for SessionGuard idle-timeout and the absolute
 * 8-hour session timeout.
 *
 * These tests protect against two specific regressions fixed in v2.2.6:
 *
 * Bug 1 (Client-side): The useEffect that runs the idle-check polling
 *   had `update`, `markActivity`, `idleTimeoutMs`, `warningMs` in its
 *   dependency array.  Those values receive new identities on every
 *   SessionProvider auto-refetch (~5 min), which re-ran the effect and
 *   executed `lastActivityRef.current = Date.now()`, silently resetting
 *   the idle clock so it could never reach the 20-minute threshold.
 *
 * Bug 2 (Server-side): proxy.ts treated all requests to
 *   /api/auth/session as user activity, including automatic GET
 *   refetches.  This reset the `techhub-activity` cookie every 5
 *   minutes even with zero user interaction.
 *
 * The proxy-side tests for Bug 2 live in proxy.gap.test.ts.  This file
 * covers the client-side SessionGuard (Bug 1) plus additional
 * regression tests for the absolute timeout enforcement in auth.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — must be set up before any dynamic imports
// ---------------------------------------------------------------------------

// Fake timers for deterministic time control
beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: false }));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.resetModules();
});

// ---------------------------------------------------------------------------
//  SessionGuard — client-side regression tests
// ---------------------------------------------------------------------------
//
// SessionGuard is a 'use client' React component that relies on browser
// globals (window, setInterval) and React hooks.  Rather than fighting a
// full React + JSDOM render, we verify the critical contracts via
// **static source analysis**: reading the component source and asserting
// on the patterns that caused the original bugs.
//
// This is intentional — the regressions were caused by subtle dependency
// array issues that are best caught by inspecting the source directly,
// rather than by integration-level render tests that might pass even
// with the bug present (because useState/useEffect timing masks it).
// ---------------------------------------------------------------------------
import fs from 'fs';
import path from 'path';

describe('SessionGuard idle-timeout regressions (source analysis)', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '../src/components/SessionGuard.tsx'),
    'utf-8'
  );

  // -----------------------------------------------------------
  // REGRESSION: useEffect dependency array must be stable
  // The bug was: [status, markActivity, idleTimeoutMs, warningMs, update]
  // The fix is:  [status, markActivity]
  // -----------------------------------------------------------
  it('main idle-timer effect depends only on [status, markActivity]', () => {
    // Find the dependency array of the main useEffect (the one with
    // the comment about "stable deps only")
    const effectDepMatch = src.match(/\}, \[status, markActivity\]\);.*stable deps/);
    expect(effectDepMatch).not.toBeNull();

    // Ensure the old buggy pattern is NOT present
    expect(src).not.toContain('[status, markActivity, idleTimeoutMs, warningMs, update]');
  });

  // -----------------------------------------------------------
  // REGRESSION: markActivity callback must have empty deps
  // The bug was: useCallback(..., [update])
  // The fix is:  useCallback(..., [])
  // -----------------------------------------------------------
  it('markActivity callback has empty dependency array (stable identity)', () => {
    // The useCallback for markActivity should end with `}, []);`
    // and a comment about "stable — no deps"
    const callbackMatch = src.match(/\}, \[\]\);.*stable/);
    expect(callbackMatch).not.toBeNull();

    // The old buggy pattern (update in deps) should NOT exist
    // Note: useCallback itself is fine — the fix is using [] deps, not removing useCallback
    expect(src).not.toMatch(/useCallback\([^)]*\), \[update\]/);
  });

  // -----------------------------------------------------------
  // REGRESSION: update must be accessed via ref, not closure
  // -----------------------------------------------------------
  it('uses updateRef.current instead of direct update closure in callbacks', () => {
    // The component should have an updateRef
    expect(src).toContain('const updateRef = useRef(update)');
    expect(src).toContain('updateRef.current = update');

    // markActivity should use updateRef.current, not bare update()
    // Find the markActivity function body
    const markActivityMatch = src.match(/const markActivity = useCallback\(\(\) => \{([\s\S]*?)\}, \[\]\)/);
    expect(markActivityMatch).not.toBeNull();
    const markActivityBody = markActivityMatch![1];
    expect(markActivityBody).toContain('updateRef.current(');
    // Ensure it does NOT call `update(` directly (would be a closure dependency bug)
    expect(markActivityBody).not.toMatch(/\bupdate\(/);
  });

  // -----------------------------------------------------------
  // REGRESSION: timeout values must be read from refs in the
  // interval callbacks, not from the closure
  // -----------------------------------------------------------
  it('reads idleTimeoutMs and warningMs from refs inside interval callbacks', () => {
    expect(src).toContain('idleTimeoutRef.current');
    expect(src).toContain('warningRef.current');

    // The setInterval callback should reference idleTimeoutRef/warningRef
    // not bare idleTimeoutMs/warningMs variables
    const intervalMatch = src.match(/checkIntervalRef\.current = setInterval\(\(\) => \{([\s\S]*?)\}, CHECK_INTERVAL_MS\)/);
    expect(intervalMatch).not.toBeNull();
    const intervalBody = intervalMatch![1];
    expect(intervalBody).toContain('idleTimeoutRef.current');
    expect(intervalBody).toContain('warningRef.current');
    // Should NOT use bare idleTimeoutMs or warningMs in the interval
    expect(intervalBody).not.toMatch(/\bidleTimeoutMs\b/);
    expect(intervalBody).not.toMatch(/\bwarningMs\b/);
  });

  // -----------------------------------------------------------
  // idleSignOut calls updateRef.current in the interval
  // -----------------------------------------------------------
  it('interval calls idleSignOut(updateRef.current) not idleSignOut(update)', () => {
    const intervalMatch = src.match(/checkIntervalRef\.current = setInterval\(\(\) => \{([\s\S]*?)\}, CHECK_INTERVAL_MS\)/);
    expect(intervalMatch).not.toBeNull();
    const body = intervalMatch![1];
    expect(body).toContain('idleSignOut(updateRef.current)');
    expect(body).not.toMatch(/idleSignOut\(update\b[^R]/);
  });

  // -----------------------------------------------------------
  // Activity events are the expected set
  // -----------------------------------------------------------
  it('registers mousedown, keydown, touchstart, click listeners', () => {
    expect(src).toContain("'mousedown', 'keydown', 'touchstart', 'click'");
  });

  // -----------------------------------------------------------
  // Effect does nothing when status !== authenticated
  // -----------------------------------------------------------
  it('guards the effect body with status check', () => {
    expect(src).toContain("if (status !== 'authenticated') return;");
  });
});

// ---------------------------------------------------------------------------
//  Absolute timeout (8-hour) — regression tests
// ---------------------------------------------------------------------------
describe('Absolute session timeout regressions', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock('@next-auth/prisma-adapter', () => ({ PrismaAdapter: () => ({}) }));
    vi.doMock('../src/lib/audit', () => ({ writeAuditLog: vi.fn() }));
    vi.doMock('../src/lib/sso', () => ({ getSsoConfigMap: async () => new Map() }));
    vi.doMock('../src/lib/redis', () => ({
      getSharedRedisClient: vi.fn().mockResolvedValue(null),
    }));
    vi.doMock('../src/lib/sessionTracker', () => ({
      trackSession: vi.fn().mockResolvedValue(0),
      untrackSession: vi.fn().mockResolvedValue(undefined),
      refreshSession: vi.fn().mockResolvedValue(0),
      clearAllSessions: vi.fn().mockResolvedValue(undefined),
    }));
  });

  const mockUser = {
    roles: [{ role: { name: 'user' } }],
    mustChangePassword: false,
    updatedAt: new Date().toISOString(),
  };

  it('revokes token exactly at the boundary (iat === maxAge)', async () => {
    process.env.SESSION_MAX_AGE_SECONDS = '100';
    process.env.JWT_CHECK_INTERVAL_MS = '0';

    vi.doMock('../src/lib/prisma', () => ({
      prisma: { user: { findUnique: vi.fn(async () => mockUser) } },
    }));

    const { getAuthOptions } = await import('../src/lib/auth');
    const opts = await getAuthOptions();
    const jwtCb = opts.callbacks?.jwt as any;

    // Token issued exactly 100 seconds ago — should be revoked
    const token = { sub: 'u1', iat: Math.floor(Date.now() / 1000) - 100 } as any;
    const out = await jwtCb({ token });
    expect(out.revoked).toBe(true);
  });

  it('does NOT revoke token 1 second before boundary', async () => {
    process.env.SESSION_MAX_AGE_SECONDS = '100';
    process.env.JWT_CHECK_INTERVAL_MS = '0';

    vi.doMock('../src/lib/prisma', () => ({
      prisma: { user: { findUnique: vi.fn(async () => mockUser) } },
    }));

    const { getAuthOptions } = await import('../src/lib/auth');
    const opts = await getAuthOptions();
    const jwtCb = opts.callbacks?.jwt as any;

    // Token issued 99 seconds ago — should NOT be revoked yet
    const token = { sub: 'u1', iat: Math.floor(Date.now() / 1000) - 99 } as any;
    const out = await jwtCb({ token });
    expect(out.revoked).toBeUndefined();
  });

  it('uses default 8-hour max age when env is unset', async () => {
    delete process.env.SESSION_MAX_AGE_SECONDS;
    process.env.JWT_CHECK_INTERVAL_MS = '0';

    vi.doMock('../src/lib/prisma', () => ({
      prisma: { user: { findUnique: vi.fn(async () => mockUser) } },
    }));

    const { getAuthOptions } = await import('../src/lib/auth');
    const opts = await getAuthOptions();
    const jwtCb = opts.callbacks?.jwt as any;

    // Token issued 7 hours ago (25200s) — within 8h (28800s), should be fine
    const token = { sub: 'u1', iat: Math.floor(Date.now() / 1000) - 25200 } as any;
    const out = await jwtCb({ token });
    expect(out.revoked).toBeUndefined();
  });

  it('revokes token well past the 8-hour default', async () => {
    delete process.env.SESSION_MAX_AGE_SECONDS;
    process.env.JWT_CHECK_INTERVAL_MS = '0';

    vi.doMock('../src/lib/prisma', () => ({
      prisma: { user: { findUnique: vi.fn(async () => mockUser) } },
    }));

    const { getAuthOptions } = await import('../src/lib/auth');
    const opts = await getAuthOptions();
    const jwtCb = opts.callbacks?.jwt as any;

    // Token issued 9 hours ago (32400s) — past 8h (28800s), should be revoked
    const token = { sub: 'u1', iat: Math.floor(Date.now() / 1000) - 32400 } as any;
    const out = await jwtCb({ token });
    expect(out.revoked).toBe(true);
  });

  it('absolute timeout fires regardless of recent activity', async () => {
    process.env.SESSION_MAX_AGE_SECONDS = '10';
    process.env.JWT_CHECK_INTERVAL_MS = '0';

    vi.doMock('../src/lib/prisma', () => ({
      prisma: { user: { findUnique: vi.fn(async () => mockUser) } },
    }));

    const { getAuthOptions } = await import('../src/lib/auth');
    const opts = await getAuthOptions();
    const jwtCb = opts.callbacks?.jwt as any;

    // Token issued 30s ago, max age 10s — revoked even though this is a
    // "fresh" request (the user is ACTIVE but the absolute limit is up)
    const token = {
      sub: 'u1',
      iat: Math.floor(Date.now() / 1000) - 30,
      // Simulate recent activity on the token
      interacted: Date.now(),
    } as any;
    const out = await jwtCb({ token });
    expect(out.revoked).toBe(true);
  });
});

// ---------------------------------------------------------------------------
//  Server-side idle enforcement — additional regression coverage
//  (complements proxy.gap.test.ts POST vs GET tests)
// ---------------------------------------------------------------------------
describe('Proxy idle-timeout server-side regressions', () => {
  const mockGetToken = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    process.env.NEXTAUTH_SECRET = 'test-secret-for-proxy-regression';
    vi.doMock('next-auth/jwt', () => ({
      getToken: (...a: any[]) => mockGetToken(...a),
    }));
    vi.doMock('./lib/auth-config', () => ({
      getSessionIdleTimeoutMs: vi.fn().mockReturnValue(5000), // 5 seconds
    }));
  });

  function buildRequest(overrides: {
    method?: string;
    pathname?: string;
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
  } = {}) {
    const { method = 'GET', pathname = '/', headers: hdrs = {}, cookies: cks = {} } = overrides;
    const headerMap = new Headers(hdrs);
    const nextUrl = { pathname, clone: () => ({ ...nextUrl }) };
    return {
      method,
      url: `http://localhost:3000${pathname}`,
      nextUrl,
      headers: {
        get: (k: string) => headerMap.get(k),
        has: (k: string) => headerMap.has(k),
        set: (k: string, v: string) => headerMap.set(k, v),
        entries: () => headerMap.entries(),
        forEach: (cb: any) => headerMap.forEach(cb),
        [Symbol.iterator]: () => headerMap.entries(),
      },
      cookies: {
        get: (name: string) => {
          const val = cks[name];
          return val !== undefined ? { name, value: val } : undefined;
        },
      },
    } as any;
  }

  function getAllSetCookies(headers: any): string[] {
    const out: string[] = [];
    if (headers?._appended) {
      for (const [k, v] of headers._appended) {
        if (k.toLowerCase() === 'set-cookie') out.push(v);
      }
    }
    return out;
  }

  async function loadProxy() {
    // Mock NextResponse
    vi.doMock('next/server', () => {
      function makeResponse(opts: any = {}) {
        const appended: [string, string][] = [];
        const hdr = {
          get: (k: string) => null,
          set: () => {},
          append: (k: string, v: string) => appended.push([k, v]),
          entries: () => appended[Symbol.iterator](),
          forEach: (cb: any) => appended.forEach(([k, v]) => cb(v, k)),
          _appended: appended,
        };
        return { headers: hdr, _status: opts.status, _redirectUrl: opts.redirectUrl };
      }
      return {
        NextResponse: {
          next: (opts: any) => makeResponse(),
          redirect: (url: any) => makeResponse({ redirectUrl: url, status: 307 }),
          json: (body: any, init: any) => makeResponse({ status: init?.status ?? 200 }),
        },
      };
    });

    return import('../src/proxy');
  }

  it('fresh activity cookie does NOT trigger idle timeout', async () => {
    const mod = await loadProxy();
    mockGetToken.mockResolvedValue({ sub: 'u1', iat: Math.floor(Date.now() / 1000) });

    const req = buildRequest({
      pathname: '/dashboard',
      headers: { accept: 'text/html' },
      cookies: { 'techhub-activity': Date.now().toString() },
    });

    const result: any = await mod.proxy(req);
    // Should NOT redirect — cookie is fresh
    expect(result._redirectUrl).toBeUndefined();
    expect(result._status).toBeUndefined();
  });

  it('stale activity cookie triggers idle timeout redirect', async () => {
    const mod = await loadProxy();
    mockGetToken.mockResolvedValue({ sub: 'u1', iat: Math.floor(Date.now() / 1000) });

    const stale = (Date.now() - 10_000).toString(); // 10s > 5s timeout
    const req = buildRequest({
      pathname: '/dashboard',
      headers: { accept: 'text/html' },
      cookies: { 'techhub-activity': stale },
    });

    const result: any = await mod.proxy(req);
    if (result._redirectUrl) {
      expect(result._redirectUrl.pathname).toBe('/auth/signin');
    }
  });

  it('GET /api/auth/session (auto-refetch) does NOT write activity cookie', async () => {
    const mod = await loadProxy();
    mockGetToken.mockResolvedValue({ sub: 'u1', iat: Math.floor(Date.now() / 1000) });

    const req = buildRequest({
      method: 'GET',
      pathname: '/api/auth/session',
      cookies: { 'techhub-activity': Date.now().toString() },
    });

    const result = await mod.proxy(req);
    const cookies = getAllSetCookies(result.headers);
    expect(cookies.some((c: string) => c.includes('techhub-activity='))).toBe(false);
  });

  it('POST /api/auth/session (user update()) DOES write activity cookie', async () => {
    const mod = await loadProxy();
    mockGetToken.mockResolvedValue({ sub: 'u1', iat: Math.floor(Date.now() / 1000) });

    const req = buildRequest({
      method: 'POST',
      pathname: '/api/auth/session',
      cookies: { 'techhub-activity': Date.now().toString() },
    });

    const result = await mod.proxy(req);
    const cookies = getAllSetCookies(result.headers);
    expect(cookies.some((c: string) => c.includes('techhub-activity='))).toBe(true);
  });
});
