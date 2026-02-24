import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

function buildCsp(nonce: string) {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "img-src 'self' data: blob: https:",
    "style-src 'self' 'nonce-" + nonce + "' 'unsafe-inline'",
    "font-src 'self' https: data:",
    "script-src 'self' 'nonce-" + nonce + "' 'strict-dynamic' https: 'unsafe-inline'",
    "connect-src 'self' https:",
    "object-src 'none'",
    "frame-ancestors 'self'"
  ].join('; ');
}

export async function middleware(request: NextRequest) {
  const nonce = (globalThis as any)?.crypto?.randomUUID?.();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders
    }
  });

  const accept = request.headers.get('accept') ?? '';
  if (accept.includes('text/html')) {
    response.headers.set('Content-Security-Policy', buildCsp(nonce));
  }

  const pathname = request.nextUrl.pathname;
  const exactPaths = [
    '/auth/signin',
    '/auth/post-login',
    '/auth/change-password',
    '/api/health'
  ];

  const apiDirectories = [
    '/api/auth'
  ];

  const isExactAllowed = exactPaths.includes(pathname);
  const isApiAllowed = apiDirectories.some((dir) => pathname === dir || pathname.startsWith(dir + '/'));
  const isAllowed = isExactAllowed || isApiAllowed;

  if (!isAllowed) {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

    // If the token was marked revoked by the periodic JWT check, force
    // the user to sign in again.
    if (token?.revoked) {
      const signInUrl = request.nextUrl.clone();
      signInUrl.pathname = '/auth/signin';
      return NextResponse.redirect(signInUrl);
    }

    if (token?.mustChangePassword && token?.authProvider === 'credentials') {
      const url = request.nextUrl.clone();
      // If this is an API request, return a JSON 403 so callers (fetch/Postman)
      // receive a machine-readable error. For browser HTML requests, redirect
      // to the change-password page as before.
      if (request.nextUrl.pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'must_change_password' }, { status: 403 });
      }

      url.pathname = '/auth/change-password';
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  // Run middleware for API routes as well so server endpoints can be protected
  // when a user must change their password. Static/_next assets remain excluded.
  matcher: ['/((?!_next/static|_next/image|_next/data|favicon.ico|theme-init.js|uploads/).*)']
};
