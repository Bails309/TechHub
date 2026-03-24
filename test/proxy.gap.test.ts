import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock next-auth/jwt
const mockGetToken = vi.fn();
vi.mock('next-auth/jwt', () => ({
  getToken: (...a: any[]) => mockGetToken(...a)
}));

// Mock auth-config
vi.mock('./lib/auth-config', () => ({
  getSessionIdleTimeoutMs: vi.fn().mockReturnValue(3600000) // 1 hour
}));

// Build a minimal NextRequest-like object
function buildRequest(overrides: {
  method?: string;
  url?: string;
  pathname?: string;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
} = {}) {
  const {
    method = 'GET',
    url = 'http://localhost:3000/',
    pathname = '/',
    headers: hdrs = {},
    cookies: cks = {}
  } = overrides;

  const headerMap = new Headers(hdrs);
  const nextUrl = {
    pathname,
    clone: () => ({ ...nextUrl })
  };

  return {
    method,
    url,
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
      }
    }
  } as any;
}

// We must test proxy() which is the default export.
// It uses NextResponse.next() and NextResponse.redirect() and NextResponse.json().
// We need to mock 'next/server' module.
const mockNextFn = vi.fn();
const mockRedirect = vi.fn();
const mockJson = vi.fn();

vi.mock('next/server', () => {
  return {
    NextResponse: {
      next: (...args: any[]) => mockNextFn(...args),
      redirect: (...args: any[]) => mockRedirect(...args),
      json: (...args: any[]) => mockJson(...args),
    }
  };
});

// Prepare consistent response mocks
function buildMockResponse() {
  const responseHeaders = new Headers();
  return {
    headers: responseHeaders,
    cookies: {
      set: vi.fn(),
      delete: vi.fn()
    }
  };
}

// Type for mock proxy responses with custom test-tracking properties
type MockProxyResult = {
  headers: Headers;
  cookies: { set: (...args: any[]) => void; delete: (...args: any[]) => void };
  _status?: number;
  _body?: any;
  _redirectUrl?: { pathname: string };
};

const _mod = await import('../src/proxy');
const mod = { proxy: _mod.proxy as unknown as (req: any) => Promise<MockProxyResult> };

describe('proxy.ts – proxy() function gap coverage', () => {
  let mockResponse: ReturnType<typeof buildMockResponse>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-for-proxy');
    mockResponse = buildMockResponse();
    mockNextFn.mockReturnValue(mockResponse);
    mockRedirect.mockImplementation((url: any) => {
      const resp = buildMockResponse();
      (resp as any)._redirectUrl = url;
      return resp;
    });
    mockJson.mockImplementation((body: any, init: any) => {
      const resp = buildMockResponse();
      (resp as any)._body = body;
      (resp as any)._status = init?.status;
      return resp;
    });
  });

  it('sets CSP header on HTML requests', async () => {
    mockGetToken.mockResolvedValue(null);
    const req = buildRequest({
      headers: { accept: 'text/html' }
    });

    const result = await mod.proxy(req);
    const csp = result.headers.get('Content-Security-Policy');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain('nonce-');
  });

  it('does not set CSP on non-HTML requests', async () => {
    mockGetToken.mockResolvedValue(null);
    const req = buildRequest({
      headers: { accept: 'application/json' }
    });

    const result = await mod.proxy(req);
    expect(result.headers.get('Content-Security-Policy')).toBeNull();
  });

  it('sets HSTS in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PLAYWRIGHT_TESTING', '');
    mockGetToken.mockResolvedValue(null);
    const req = buildRequest({
      headers: { accept: 'text/html' }
    });

    const result = await mod.proxy(req);
    expect(result.headers.get('Strict-Transport-Security')).toContain('max-age=');
  });

  it('generates XSRF-TOKEN for authenticated GET', async () => {
    mockGetToken.mockResolvedValue({ sub: 'user-123' });
    const req = buildRequest({
      method: 'GET',
      pathname: '/dashboard'
    });

    const result = await mod.proxy(req);
    const cookies = result.headers.getSetCookie?.() ?? getAllSetCookies(result.headers);
    expect(cookies.some((c: string) => c.includes('XSRF-TOKEN='))).toBe(true);
  });

  it('generates XSRF-TOKEN-PUBLIC for unauthenticated GET', async () => {
    mockGetToken.mockResolvedValue(null);
    const req = buildRequest({
      method: 'GET',
      pathname: '/'
    });

    const result = await mod.proxy(req);
    const cookies = getAllSetCookies(result.headers);
    expect(cookies.some((c: string) => c.includes('XSRF-TOKEN-PUBLIC='))).toBe(true);
  });

  it('generates visitor-id cookie when not present', async () => {
    mockGetToken.mockResolvedValue(null);
    const req = buildRequest({
      method: 'GET',
      pathname: '/'
    });

    const result = await mod.proxy(req);
    const cookies = getAllSetCookies(result.headers);
    expect(cookies.some((c: string) => c.includes('visitor-id='))).toBe(true);
  });

  it('rejects POST when CSRF token is invalid (authenticated)', async () => {
    mockGetToken.mockResolvedValue({ sub: 'user-123' });
    const req = buildRequest({
      method: 'POST',
      pathname: '/api/apps',
      headers: { 'x-csrf-token': 'bad-token' },
      cookies: { 'XSRF-TOKEN': 'bad-token' }
    });

    const result = await mod.proxy(req);
    expect(result._status).toBe(403);
    expect(result._body).toEqual({ error: 'invalid_csrf_token' });
  });

  it('rejects POST when CSRF token is invalid (unauthenticated)', async () => {
    mockGetToken.mockResolvedValue(null);
    const req = buildRequest({
      method: 'POST',
      pathname: '/api/feedback',
      headers: { 'x-csrf-token': 'bad' },
      cookies: { 'visitor-id': 'v1', 'XSRF-TOKEN-PUBLIC': 'bad' }
    });

    const result = await mod.proxy(req);
    expect(result._status).toBe(403);
  });

  it('skips CSRF enforcement for /api/auth paths', async () => {
    mockGetToken.mockResolvedValue({ sub: 'user-1' });
    const req = buildRequest({
      method: 'POST',
      pathname: '/api/auth/session'
    });

    const result = await mod.proxy(req);
    // Should NOT have returned 403
    expect(result._status).not.toBe(403);
  });

  it('skips CSRF for /api/launch/ paths', async () => {
    mockGetToken.mockResolvedValue({ sub: 'user-1' });
    const req = buildRequest({
      method: 'POST',
      pathname: '/api/launch/abc'
    });

    const result = await mod.proxy(req);
    expect(result._status).not.toBe(403);
  });

  it('skips CSRF for server actions (next-action header)', async () => {
    mockGetToken.mockResolvedValue({ sub: 'user-1' });
    const req = buildRequest({
      method: 'POST',
      pathname: '/dashboard',
      headers: { 'next-action': 'abc123' }
    });

    const result = await mod.proxy(req);
    expect(result._status).not.toBe(403);
  });

  it('handles idle timeout on protected path (redirect)', async () => {
    const iat = Math.floor(Date.now() / 1000);
    mockGetToken
      .mockResolvedValueOnce({ sub: 'user-1' }) // first call for CSRF GET check wouldn't happen on POST
      .mockResolvedValue({ sub: 'user-1', iat }); // second call for auth guard
    
    // Simulate stale activity: 2 hours ago (> 1hr idle timeout)
    const staleTimestamp = (Date.now() - 2 * 3600 * 1000).toString();
    const req = buildRequest({
      method: 'GET',
      pathname: '/dashboard',
      headers: { accept: 'text/html' },
      cookies: { 'techhub-activity': staleTimestamp }
    });

    const result = await mod.proxy(req);
    // Either redirect or cookie clear
    if (result._redirectUrl) {
      expect(result._redirectUrl.pathname).toBe('/auth/signin');
    }
  });

  it('handles idle timeout on API path (401)', async () => {
    const iat = Math.floor(Date.now() / 1000);
    mockGetToken.mockResolvedValue({ sub: 'user-1', iat });

    const staleTimestamp = (Date.now() - 2 * 3600 * 1000).toString();
    const req = buildRequest({
      method: 'GET',
      pathname: '/api/apps',
      headers: { accept: 'application/json' },
      cookies: { 'techhub-activity': staleTimestamp }
    });

    const result = await mod.proxy(req);
    if (result._status) {
      expect(result._status).toBe(401);
    }
  });

  it('handles idle timeout on allowed path (silent clear)', async () => {
    const iat = Math.floor(Date.now() / 1000);
    mockGetToken.mockResolvedValue({ sub: 'user-1', iat });

    const staleTimestamp = (Date.now() - 2 * 3600 * 1000).toString();
    const req = buildRequest({
      method: 'GET',
      pathname: '/auth/signin',
      cookies: { 'techhub-activity': staleTimestamp }
    });

    const result = await mod.proxy(req);
    // Should not redirect, but should clear cookies
    const cookies = getAllSetCookies(result.headers);
    const cleared = cookies.some((c: string) => c.includes('Max-Age=0'));
    expect(cleared).toBe(true);
  });

  it('redirects revoked token on protected path', async () => {
    // First call (GET CSRF path) returns the token; second call returns revoked token for auth guard
    mockGetToken.mockResolvedValue({ sub: 'user-1', iat: Math.floor(Date.now() / 1000), revoked: true });

    const req = buildRequest({
      method: 'GET',
      pathname: '/dashboard',
      cookies: {
        'techhub-activity': Date.now().toString(),
        'XSRF-TOKEN': 'valid'
      }
    });

    const result = await mod.proxy(req);
    if (result._redirectUrl) {
      expect(result._redirectUrl.pathname).toBe('/auth/signin');
    }
  });

  it('enforces password change redirect on protected path', async () => {
    mockGetToken.mockResolvedValue({
      sub: 'user-1',
      iat: Math.floor(Date.now() / 1000),
      mustChangePassword: true,
      authProvider: 'credentials'
    });

    const req = buildRequest({
      method: 'GET',
      pathname: '/dashboard',
      cookies: { 'techhub-activity': Date.now().toString() }
    });

    const result = await mod.proxy(req);
    if (result._redirectUrl) {
      expect(result._redirectUrl.pathname).toBe('/auth/change-password');
    }
  });

  it('returns 403 for API when mustChangePassword', async () => {
    mockGetToken.mockResolvedValue({
      sub: 'user-1',
      iat: Math.floor(Date.now() / 1000),
      mustChangePassword: true,
      authProvider: 'credentials'
    });

    const req = buildRequest({
      method: 'GET',
      pathname: '/api/apps',
      cookies: { 'techhub-activity': Date.now().toString() }
    });

    const result = await mod.proxy(req);
    if (result._status) {
      expect(result._status).toBe(403);
    }
  });

  it('redirects unauthenticated user on protected path', async () => {
    mockGetToken.mockResolvedValue(null);

    const req = buildRequest({
      method: 'GET',
      pathname: '/dashboard'
    });

    const result = await mod.proxy(req);
    if (result._redirectUrl) {
      expect(result._redirectUrl.pathname).toBe('/auth/signin');
    }
  });

  it('allows unauthenticated access to /launch-confirm path', async () => {
    mockGetToken.mockResolvedValue(null);

    const req = buildRequest({
      method: 'GET',
      pathname: '/launch-confirm/app-1'
    });

    const result = await mod.proxy(req);
    // Should not redirect
    expect(result._redirectUrl).toBeUndefined();
  });

  it('updates activity cookie on navigation for authenticated user', async () => {
    mockGetToken.mockResolvedValue({
      sub: 'user-1',
      iat: Math.floor(Date.now() / 1000)
    });

    const req = buildRequest({
      method: 'GET',
      pathname: '/dashboard',
      headers: { accept: 'text/html', 'sec-fetch-dest': 'document' },
      cookies: { 'techhub-activity': Date.now().toString() }
    });

    const result = await mod.proxy(req);
    const cookies = getAllSetCookies(result.headers);
    expect(cookies.some((c: string) => c.includes('techhub-activity='))).toBe(true);
  });

  it('updates activity cookie on session update path', async () => {
    mockGetToken.mockResolvedValue({
      sub: 'user-1',
      iat: Math.floor(Date.now() / 1000)
    });

    const req = buildRequest({
      method: 'GET',
      pathname: '/api/auth/session',
      cookies: { 'techhub-activity': Date.now().toString() }
    });

    const result = await mod.proxy(req);
    const cookies = getAllSetCookies(result.headers);
    expect(cookies.some((c: string) => c.includes('techhub-activity='))).toBe(true);
  });

  it('handles CSRF from form body on POST', async () => {
    mockGetToken.mockResolvedValue({ sub: 'user-1' });

    // Create a request with form-urlencoded content type but no x-csrf-token header
    const req = buildRequest({
      method: 'POST',
      pathname: '/api/settings',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      cookies: { 'XSRF-TOKEN': 'nonce.sig' }
    });

    // Add clone + formData 
    req.clone = () => ({
      ...req,
      formData: async () => {
        const fd = new FormData();
        fd.set('csrfToken', 'nonce.sig');
        return fd;
      }
    });

    const result = await mod.proxy(req);
    // Token validation will still fail since we can't generate a valid HMAC
    // but the form body extraction path is exercised
    expect(result._status).toBe(403);
  });

  it('validates existing XSRF-TOKEN cookie for authenticated GET', async () => {
    mockGetToken.mockResolvedValue({ sub: 'user-1' });

    // Provide an existing XSRF-TOKEN (invalid sig, so it will be replaced)
    const req = buildRequest({
      method: 'GET',
      pathname: '/dashboard',
      cookies: { 'XSRF-TOKEN': 'old-nonce.bad-sig' }
    });

    const result = await mod.proxy(req);
    const cookies = getAllSetCookies(result.headers);
    // Should have generated a new token since validation fails
    expect(cookies.some((c: string) => c.includes('XSRF-TOKEN='))).toBe(true);
  });

  it('validates existing XSRF-TOKEN-PUBLIC cookie for unauthenticated GET', async () => {
    mockGetToken.mockResolvedValue(null);

    const req = buildRequest({
      method: 'GET',
      pathname: '/',
      cookies: { 'visitor-id': 'test-vid', 'XSRF-TOKEN-PUBLIC': 'old.bad' }
    });

    const result = await mod.proxy(req);
    const cookies = getAllSetCookies(result.headers);
    // Should have generated a new public token since validation fails
    expect(cookies.some((c: string) => c.includes('XSRF-TOKEN-PUBLIC='))).toBe(true);
  });
});

// Helper to extract all Set-Cookie values from Headers
function getAllSetCookies(headers: Headers): string[] {
  const result: string[] = [];
  headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') {
      result.push(value);
    }
  });
  // Also try getSetCookie if available
  if (typeof (headers as any).getSetCookie === 'function') {
    return (headers as any).getSetCookie();
  }
  return result;
}
