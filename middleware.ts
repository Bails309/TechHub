import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

function buildCsp(nonce: string) {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "img-src 'self' data: blob: https:",
    "style-src 'self' 'nonce-" + nonce + "' https:",
    "font-src 'self' https: data:",
    "script-src 'self' 'nonce-" + nonce + "' https:",
    "connect-src 'self' https:",
    "object-src 'none'",
    "frame-ancestors 'self'"
  ].join('; ');
}

export function middleware(request: NextRequest) {
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

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
