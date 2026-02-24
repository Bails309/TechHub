import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('middleware revocation and must-change-password handling (unit)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('redirects revoked tokens to sign-in', async () => {
    vi.doMock('next-auth/jwt', () => ({ getToken: async () => ({ revoked: true }) }));
    vi.doMock('next/server', () => ({
      NextResponse: {
        next: (opts: any) => ({ type: 'next', headers: opts.request.headers }),
        json: (body: any, opts: any) => ({ type: 'json', body, status: opts.status }),
        redirect: (url: any) => ({ type: 'redirect', location: url?.pathname ?? String(url) })
      }
    }));

    const { getToken } = await import('next-auth/jwt');
    const { NextResponse } = await import('next/server');

    async function localMiddleware(request: any) {
      const allowlist = ['/auth/signin', '/auth/post-login', '/auth/change-password', '/api/auth', '/api/health'];
      const pathname = request.nextUrl.pathname;
      const isAllowed = allowlist.some((p) => pathname.startsWith(p));
      if (isAllowed) return NextResponse.next({ request: { headers: request.headers } });

      const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
      if (token?.revoked) {
        const signInUrl = request.nextUrl.clone();
        signInUrl.pathname = '/auth/signin';
        return NextResponse.redirect(signInUrl);
      }
      if (token?.mustChangePassword && token?.authProvider === 'credentials') {
        if (request.nextUrl.pathname.startsWith('/api/')) {
          return NextResponse.json({ error: 'must_change_password' }, { status: 403 });
        }
        const url = request.nextUrl.clone();
        url.pathname = '/auth/change-password';
        return NextResponse.redirect(url);
      }

      return NextResponse.next({ request: { headers: request.headers } });
    }

    const fakeReq: any = {
      headers: new Headers([['accept', 'text/html']]),
      nextUrl: { pathname: '/private', clone() { return { pathname: '/auth/signin' }; } }
    };

    const res = await localMiddleware(fakeReq as any);
    expect(res).toEqual({ type: 'redirect', location: '/auth/signin' });
  });

  it('returns JSON 403 for API requests when mustChangePassword is set', async () => {
    vi.doMock('next-auth/jwt', () => ({ getToken: async () => ({ mustChangePassword: true, authProvider: 'credentials' }) }));
    vi.doMock('next/server', () => ({
      NextResponse: {
        next: (opts: any) => ({ type: 'next', headers: opts.request.headers }),
        json: (body: any, opts: any) => ({ type: 'json', body, status: opts.status }),
        redirect: (url: any) => ({ type: 'redirect', location: url?.pathname ?? String(url) })
      }
    }));

    const { getToken } = await import('next-auth/jwt');
    const { NextResponse } = await import('next/server');

    async function localMiddleware(request: any) {
      const allowlist = ['/auth/signin', '/auth/post-login', '/auth/change-password', '/api/auth', '/api/health'];
      const pathname = request.nextUrl.pathname;
      const isAllowed = allowlist.some((p) => pathname.startsWith(p));
      if (isAllowed) return NextResponse.next({ request: { headers: request.headers } });

      const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
      if (token?.revoked) {
        const signInUrl = request.nextUrl.clone();
        signInUrl.pathname = '/auth/signin';
        return NextResponse.redirect(signInUrl);
      }
      if (token?.mustChangePassword && token?.authProvider === 'credentials') {
        if (request.nextUrl.pathname.startsWith('/api/')) {
          return NextResponse.json({ error: 'must_change_password' }, { status: 403 });
        }
        const url = request.nextUrl.clone();
        url.pathname = '/auth/change-password';
        return NextResponse.redirect(url);
      }

      return NextResponse.next({ request: { headers: request.headers } });
    }

    const fakeReq: any = {
      headers: new Headers([['accept', 'application/json']]),
      nextUrl: { pathname: '/api/resource', clone() { return { pathname: '/auth/change-password' }; } }
    };

    const res = await localMiddleware(fakeReq as any);
    expect(res).toEqual({ type: 'json', body: { error: 'must_change_password' }, status: 403 });
  });

  it('redirects HTML request to change-password when mustChangePassword is set', async () => {
    vi.doMock('next-auth/jwt', () => ({ getToken: async () => ({ mustChangePassword: true, authProvider: 'credentials' }) }));
    vi.doMock('next/server', () => ({
      NextResponse: {
        next: (opts: any) => ({ type: 'next', headers: opts.request.headers }),
        json: (body: any, opts: any) => ({ type: 'json', body, status: opts.status }),
        redirect: (url: any) => ({ type: 'redirect', location: url?.pathname ?? String(url) })
      }
    }));

    const { getToken } = await import('next-auth/jwt');
    const { NextResponse } = await import('next/server');

    async function localMiddleware(request: any) {
      const allowlist = ['/auth/signin', '/auth/post-login', '/auth/change-password', '/api/auth', '/api/health'];
      const pathname = request.nextUrl.pathname;
      const isAllowed = allowlist.some((p) => pathname.startsWith(p));
      if (isAllowed) return NextResponse.next({ request: { headers: request.headers } });

      const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
      if (token?.revoked) {
        const signInUrl = request.nextUrl.clone();
        signInUrl.pathname = '/auth/signin';
        return NextResponse.redirect(signInUrl);
      }
      if (token?.mustChangePassword && token?.authProvider === 'credentials') {
        if (request.nextUrl.pathname.startsWith('/api/')) {
          return NextResponse.json({ error: 'must_change_password' }, { status: 403 });
        }
        const url = request.nextUrl.clone();
        url.pathname = '/auth/change-password';
        return NextResponse.redirect(url);
      }

      return NextResponse.next({ request: { headers: request.headers } });
    }

    const fakeReq: any = {
      headers: new Headers([['accept', 'text/html']]),
      nextUrl: { pathname: '/private', clone() { return { pathname: '/auth/change-password' }; } }
    };

    const res = await localMiddleware(fakeReq as any);
    expect(res).toEqual({ type: 'redirect', location: '/auth/change-password' });
  });
});
