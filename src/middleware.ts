import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { getSessionIdleTimeoutMs } from './lib/auth-config';

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
  if (a.length !== b.length || a.length === 0) return false;
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  let result = 0;
  for (let i = 0; i < aBytes.length; i++) {
    result |= aBytes[i] ^ bBytes[i];
  }
  return result === 0;
}

async function validateCsrfToken(token: string, sessionId: string): Promise<boolean> {
  const secret = process.env.NEXTAUTH_SECRET ?? '';
  if (!token || !sessionId || !secret || sessionId.trim() === '') return false;

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

async function validatePublicCsrfToken(token: string, visitorId: string): Promise<boolean> {
  const secret = process.env.NEXTAUTH_SECRET ?? '';
  if (!token || !visitorId || !secret || visitorId.trim() === '') return false;

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
      enc.encode('public:' + nonce + ':' + visitorId)
    );

    const sigHex = buf2hex(signature);
    return timingSafeEqual(sigHex, sig);
  } catch (err) {
    return false;
  }
}

async function createCsrfToken(sessionId: string): Promise<string> {
  const secret = process.env.NEXTAUTH_SECRET ?? '';
  if (!sessionId) throw new Error('CSRF: sessionId required');
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

async function createPublicCsrfToken(visitorId: string): Promise<string> {
  const secret = process.env.NEXTAUTH_SECRET ?? '';
  if (!visitorId) throw new Error('CSRF: visitorId required');
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
    enc.encode('public:' + nonce + ':' + visitorId)
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
  if (request.method === 'GET') {
    const tokenObj = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    const sessionId = tokenObj?.sub ?? '';
    let secureFlag = process.env.NODE_ENV === 'production';
    try {
      if (process.env.NEXTAUTH_URL) {
        secureFlag = new URL(process.env.NEXTAUTH_URL).protocol === 'https:';
      }
    } catch { }
    const maxAge = 60 * 60; // 1 hour

    let visitorId = request.cookies.get('visitor-id')?.value;
    if (!visitorId) {
      visitorId = getSecureNonce(); // reuse nonce generator for random ID
      response.cookies.set({
        name: 'visitor-id',
        value: visitorId,
        httpOnly: true,
        sameSite: 'lax',
        secure: secureFlag,
        path: '/',
        maxAge: 60 * 60 * 24 * 365 // 1 year
      });
    }

    if (sessionId) {
      const existing = request.cookies.get('XSRF-TOKEN')?.value;
      const isValid = existing ? await validateCsrfToken(existing, sessionId) : false;
      if (!isValid) {
        const newToken = await createCsrfToken(sessionId);
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
    } else {
      // Unauthenticated visitor: set XSRF-TOKEN-PUBLIC
      const existing = request.cookies.get('XSRF-TOKEN-PUBLIC')?.value;
      const isValid = existing ? await validatePublicCsrfToken(existing, visitorId) : false;
      if (!isValid) {
        const newToken = await createPublicCsrfToken(visitorId);
        response.cookies.set({
          name: 'XSRF-TOKEN-PUBLIC',
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

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  const idleTimeoutMs = getSessionIdleTimeoutMs();
  const now = Date.now();

  // 1. Handle Activity Timeout (Coherent Idle Timeout)
  if (token) {
    const lastActivityStr = request.cookies.get('techhub-activity')?.value;
    const resolvedTimestamp = lastActivityStr ? Number(lastActivityStr) : (Number(token.iat ?? 0) * 1000);

    if (resolvedTimestamp > 0 && (now - resolvedTimestamp) > idleTimeoutMs) {
      console.warn('middleware: idle timeout for sub=%s, path=%s', token.sub, pathname);

      let timeoutResponse;
      if (pathname.startsWith('/api/')) {
        timeoutResponse = NextResponse.json({ error: 'idle_timeout' }, { status: 401 });
      } else {
        const signInUrl = request.nextUrl.clone();
        signInUrl.pathname = '/auth/signin';
        timeoutResponse = NextResponse.redirect(signInUrl);
      }

      timeoutResponse.cookies.delete('next-auth.session-token');
      timeoutResponse.cookies.delete('__Secure-next-auth.session-token');
      timeoutResponse.cookies.delete('techhub-activity');
      return timeoutResponse;
    }
  }

  // 2. Handle Revocation (Security Kill-switch)
  if (token?.revoked && !finalAllowed) {
    console.warn('middleware: revoking access for sub=%s (token revoked), path=%s', token.sub, pathname);
    const signInUrl = request.nextUrl.clone();
    signInUrl.pathname = '/auth/signin';
    const revokeResponse = NextResponse.redirect(signInUrl);
    revokeResponse.cookies.delete('next-auth.session-token');
    revokeResponse.cookies.delete('__Secure-next-auth.session-token');
    revokeResponse.cookies.delete('techhub-activity');
    return revokeResponse;
  }

  // 3. Force Password Change (except on the change-password page itself and auth APIs)
  if (token?.mustChangePassword &&
    token?.authProvider === 'credentials' &&
    pathname !== '/auth/change-password' &&
    !pathname.startsWith('/api/auth/')) {
    console.log('middleware: enforcing change-password redirect for sub=%s from path=%s', token.sub, pathname);

    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'must_change_password' }, { status: 403 });
    }

    const url = request.nextUrl.clone();
    url.pathname = '/auth/change-password';
    return NextResponse.redirect(url);
  }

  // 3. Authorization Check for Protected Routes
  if (!finalAllowed) {
    if (!token) {
      console.log('middleware: no token found for protected path %s, redirecting to sign-in', pathname);
      const signInUrl = request.nextUrl.clone();
      signInUrl.pathname = '/auth/signin';
      return NextResponse.redirect(signInUrl);
    }
  }

  console.log('middleware: allowing request to %s', pathname);

  // If authenticated and session is still valid, update activity cookie
  if (token && !token.revoked) {
    let secureFlag = process.env.NODE_ENV === 'production';
    try {
      if (process.env.NEXTAUTH_URL) {
        secureFlag = new URL(process.env.NEXTAUTH_URL).protocol === 'https:';
      }
    } catch { }

    response.cookies.set({
      name: 'techhub-activity',
      value: now.toString(),
      httpOnly: true,
      sameSite: 'lax',
      secure: secureFlag,
      path: '/',
      maxAge: 60 * 60 * 8 // 8 hours absolute
    });
  }

  return response;
}

export const config = {
  // Run middleware for API routes as well so server endpoints can be protected
  // when a user must change their password. Static/_next assets remain excluded.
  matcher: ['/((?!_next/static|_next/image|_next/data|favicon.ico|theme-init.js|uploads/|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)']
};
