import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('middleware revocation and must-change-password handling', () => {
  beforeEach(() => {
    vi.resetModules();
    // Provide a stable nonce generation
    global.crypto = { randomUUID: () => 'fixed-nonce' } as any;
  });

  it('redirects revoked tokens to sign-in', async () => {
    vi.mock('next-auth/jwt', () => ({ getToken: async () => ({ revoked: true }) }));

    // Mock NextResponse helpers to inspect actions
    vi.mock('next/server', () => ({
      NextResponse: {
        next: (opts: any) => ({ type: 'next', headers: opts.request.headers }),
        json: (body: any, opts: any) => ({ type: 'json', body, status: opts.status }),
        redirect: (url: any) => ({ type: 'redirect', location: url?.pathname ?? String(url) })
      }
    }));

    const { middleware } = await import('../../middleware');

    const fakeReq: any = {
      headers: new Headers([['accept', 'text/html']]),
      nextUrl: { pathname: '/private', clone() { return { pathname: '/auth/signin' }; } }
    };

    const res = await middleware(fakeReq as any);
    expect(res).toEqual({ type: 'redirect', location: '/auth/signin' });
  });

  it('returns JSON 403 for API requests when mustChangePassword is set', async () => {
    vi.mock('next-auth/jwt', () => ({ getToken: async () => ({ mustChangePassword: true, authProvider: 'credentials' }) }));

    vi.mock('next/server', () => ({
      NextResponse: {
        next: (opts: any) => ({ type: 'next', headers: opts.request.headers }),
        json: (body: any, opts: any) => ({ type: 'json', body, status: opts.status }),
        redirect: (url: any) => ({ type: 'redirect', location: url?.pathname ?? String(url) })
      }
    }));

    const { middleware } = await import('../../middleware');

    const fakeReq: any = {
      headers: new Headers([['accept', 'application/json']]),
      nextUrl: { pathname: '/api/resource', clone() { return { pathname: '/auth/change-password' }; } }
    };

    const res = await middleware(fakeReq as any);
    expect(res).toEqual({ type: 'json', body: { error: 'must_change_password' }, status: 403 });
  });

  it('redirects HTML request to change-password when mustChangePassword is set', async () => {
    vi.mock('next-auth/jwt', () => ({ getToken: async () => ({ mustChangePassword: true, authProvider: 'credentials' }) }));

    vi.mock('next/server', () => ({
      NextResponse: {
        next: (opts: any) => ({ type: 'next', headers: opts.request.headers }),
        json: (body: any, opts: any) => ({ type: 'json', body, status: opts.status }),
        redirect: (url: any) => ({ type: 'redirect', location: url?.pathname ?? String(url) })
      }
    }));

    const { middleware } = await import('../../middleware');

    const fakeReq: any = {
      headers: new Headers([['accept', 'text/html']]),
      nextUrl: { pathname: '/private', clone() { return { pathname: '/auth/change-password' }; } }
    };

    const res = await middleware(fakeReq as any);
    expect(res).toEqual({ type: 'redirect', location: '/auth/change-password' });
  });
});
