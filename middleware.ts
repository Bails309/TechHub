import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

function buildCsp(nonce: string) {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "img-src 'self' data: blob: https:",
    // Avoid 'unsafe-inline' to enforce nonce-based style execution. If you
    // must support legacy browsers that don't accept nonces, consider the
    // security trade-off before re-adding 'unsafe-inline'.
    "style-src 'self' 'nonce-" + nonce + "'",
    "font-src 'self' https: data:",
    // Avoid 'unsafe-inline' to ensure scripts execute only when covered
    // by the server-generated nonce or strict-dynamic+trusted sources.
    "script-src 'self' 'nonce-" + nonce + "' 'strict-dynamic' https:",
    "connect-src 'self' https:",
    "object-src 'none'",
    "frame-ancestors 'self'"
  ].join('; ');
}

function generateCsrfToken() {
  const crypto = (globalThis as any)?.crypto;
  if (crypto?.randomUUID) return crypto.randomUUID();
  // Secure fallback using getRandomValues
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
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

  // Ensure a CSRF cookie is present for navigation and RSC requests,
  // including client-side transitions that do not return full HTML.
  if (request.method === 'GET') {
    const csrfCookie = request.cookies.get('XSRF-TOKEN')?.value;
    if (!csrfCookie) {
      const forwardedProto = request.headers.get('x-forwarded-proto');
      const isSecure = forwardedProto === 'https' || request.nextUrl.protocol === 'https:';
      response.cookies.set({
        name: 'XSRF-TOKEN',
        value: generateCsrfToken(),
        httpOnly: false,
        sameSite: 'strict',
        secure: isSecure,
        path: '/'
      });
    }
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
