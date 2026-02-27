import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

function buildCsp(nonce: string) {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "img-src 'self' data: blob: https:",
    // Style sources: allow self and nonced styles.
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

function buf2hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)]
    .map(x => x.toString(16).padStart(2, '0'))
    .join('');
}

function getSecureNonce(): string {
  const crypto = (globalThis as any)?.crypto;
  if (crypto?.randomUUID) {
    try {
      return String(crypto.randomUUID()).replace(/-/g, '');
    } catch {
      // fallthrough to getRandomValues
    }
  }
  if (crypto?.getRandomValues) {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return buf2hex(arr.buffer);
  }
  // Fail closed: throw if no secure RNG is available in this runtime
  throw new Error('Secure crypto unavailable to generate CSP nonce');
}

function hex2buf(hex: string) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function validateCsrfToken(token: string, sessionId: string): Promise<boolean> {
  const secret = process.env.NEXTAUTH_SECRET ?? '';
  if (!token || !sessionId || !secret) return false;

  const dotIdx = token.indexOf('.');
  if (dotIdx < 1) return false;

  const nonce = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  if (!nonce || !sig) return false;

  const crypto = (globalThis as any).crypto;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  try {
    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      enc.encode(nonce + ':' + sessionId)
    );

    const sigHex = buf2hex(signature);
    return timingSafeEqual(sigHex, sig);
  } catch (err) {
    return false;
  }
}

async function createCsrfToken(sessionId: string): Promise<string> {
  const secret = process.env.NEXTAUTH_SECRET ?? '';
  const crypto = (globalThis as any).crypto;
  const nonce = getSecureNonce();

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    enc.encode(nonce + ':' + sessionId)
  );

  const sigHex = buf2hex(signature);
  return nonce + '.' + sigHex;
}

export async function middleware(request: NextRequest) {
  const nonce = getSecureNonce();
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

  // Generate an HMAC-signed CSRF cookie on every GET request.
  // The token is bound to the user's session (JWT `sub`), so it
  // can't be replayed across sessions or forged without the secret.
  if (request.method === 'GET') {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    const sessionId = token?.sub ?? '';
    const forwardedProto = request.headers.get('x-forwarded-proto');
    const isSecure = forwardedProto === 'https' || request.nextUrl.protocol === 'https:';
    // Only set the CSRF cookie for authenticated users (who have a session)
    if (sessionId) {
      const existing = request.cookies.get('XSRF-TOKEN')?.value;
      const isValid = existing ? await validateCsrfToken(existing, sessionId) : false;
      if (!isValid) {
        const newToken = await createCsrfToken(sessionId);
        // Limit lifetime and use SameSite lax to allow typical top-level navigations
        // while still protecting against cross-site requests. Use secure in prod
        // when the request appears secure.
        const maxAge = 60 * 60; // 1 hour
        const secureFlag = process.env.NODE_ENV === 'production' ? true : isSecure;
        response.cookies.set({
          name: 'XSRF-TOKEN',
          value: newToken,
          httpOnly: false,
          sameSite: 'lax',
          secure: secureFlag,
          path: '/',
          maxAge
        });
      }
    }
  }

  const pathname = request.nextUrl.pathname;
  const exactPaths = [
    '/',
    '/auth/signin',
    '/auth/post-login',
    '/auth/change-password',
    '/api/health'
  ];

  const apiDirectories = [
    '/api/auth',
    '/api/launch'
  ];

  const isExactAllowed = exactPaths.includes(pathname);
  const isApiAllowed = apiDirectories.some((dir) => pathname === dir || pathname.startsWith(dir + '/'));
  // Public interactive flows (like launch confirmation) should be reachable
  // by unauthenticated users. Allow any `/launch-confirm/*` routes.
  const isLaunchConfirm = pathname.startsWith('/launch-confirm');
  const isAllowed = isExactAllowed || isApiAllowed;
  const finalAllowed = isAllowed || isLaunchConfirm;

  if (!finalAllowed) {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

    // If the token was marked revoked by the periodic JWT check, force
    // the user to sign in again.
    // If there is no token (user unauthenticated), redirect to sign-in.
    if (!token) {
      const signInUrl = request.nextUrl.clone();
      signInUrl.pathname = '/auth/signin';
      return NextResponse.redirect(signInUrl);
    }
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
  matcher: ['/((?!_next/static|_next/image|_next/data|favicon.ico|theme-init.js|uploads/|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)']
};
