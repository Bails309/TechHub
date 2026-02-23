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
  const nonce = crypto.randomUUID();
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
  const allowlist = [
    '/auth/signin',
    '/auth/post-login',
    '/auth/change-password',
    '/api/auth',
    '/api/health'
  ];
  const isAllowed = allowlist.some((path) => pathname.startsWith(path));

  if (!isAllowed) {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (token?.mustChangePassword && token?.authProvider === 'credentials') {
      const url = request.nextUrl.clone();
      url.pathname = '/auth/change-password';
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
