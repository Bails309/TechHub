import { cookies } from 'next/headers';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// HMAC-signed CSRF tokens (Signed Double-Submit Cookie pattern)
//
// Token format:  nonce.signature
//   nonce     = 32 random hex bytes
//   signature = HMAC-SHA256(NEXTAUTH_SECRET, nonce + ":" + sessionId)
//
// The server generates the token in middleware (on every GET request) and
// sets it as a non-httpOnly cookie so the client can read it for form
// submissions. Validation recomputes the HMAC and uses timingSafeEqual.
// ---------------------------------------------------------------------------

// Read at call time, not module load — env vars may not be available yet
// during Docker startup or Edge bundling.
function getSecret(): string {
  return process.env.NEXTAUTH_SECRET ?? '';
}

/**
 * Create an HMAC-signed CSRF token bound to the given session ID.
 * Returns `nonce.signature`.
 */
export function createCsrfToken(sessionId: string): string {
  if (!sessionId) {
    throw new Error('CSRF Error: Cannot create session-bound token without a valid sessionId');
  }
  const nonce = randomBytes(16).toString('hex');
  const sig = createHmac('sha256', getSecret())
    .update(nonce + ':' + sessionId)
    .digest('hex');
  return nonce + '.' + sig;
}

/**
 * Create an HMAC-signed CSRF token bound to a stable visitor identity.
 * Used for unauthenticated flows.
 */
export function createPublicCsrfToken(visitorId: string): string {
  if (!visitorId) {
    throw new Error('CSRF Error: Cannot create visitor-bound token without a valid visitorId');
  }
  const nonce = randomBytes(16).toString('hex');
  const sig = createHmac('sha256', getSecret())
    .update('public:' + nonce + ':' + visitorId)
    .digest('hex');
  return nonce + '.' + sig;
}

/**
 * Verify that `token` is a valid HMAC-signed token for `sessionId`.
 * Uses timingSafeEqual to prevent timing side-channels.
 */
export function validateCsrfToken(token: string, sessionId: string): boolean {
  const secret = getSecret();
  if (!token || !sessionId || !secret || sessionId.trim() === '') return false;

  const dotIdx = token.indexOf('.');
  if (dotIdx < 1) return false;

  const nonce = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  if (!nonce || !sig) return false;

  const expected = createHmac('sha256', secret)
    .update(nonce + ':' + sessionId)
    .digest('hex');

  const sigBuf = Buffer.from(sig, 'utf-8');
  const expectedBuf = Buffer.from(expected, 'utf-8');

  if (sigBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(sigBuf, expectedBuf);
}

/**
 * Verify that `token` is a valid HMAC-signed token for `visitorId`.
 */
export function validatePublicCsrfToken(token: string, visitorId: string): boolean {
  const secret = getSecret();
  if (!token || !visitorId || !secret) return false;

  const dotIdx = token.indexOf('.');
  if (dotIdx < 1) return false;

  const nonce = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  if (!nonce || !sig) return false;

  const expected = createHmac('sha256', secret)
    .update('public:' + nonce + ':' + visitorId)
    .digest('hex');

  const sigBuf = Buffer.from(sig, 'utf-8');
  const expectedBuf = Buffer.from(expected, 'utf-8');

  if (sigBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(sigBuf, expectedBuf);
}

// ---------------------------------------------------------------------------
// Helpers used by server actions (preserves the existing API surface)
// ---------------------------------------------------------------------------

async function readCookieValue(name: string): Promise<string | null> {
  try {
    const jar = await cookies();
    return jar?.get ? jar.get(name)?.value ?? null : null;
  } catch {
    return null;
  }
}

/**
 * Extract the session ID (JWT `sub`) from the next-auth session token
 * cookie. Works in server-action / RSC context.
 */
async function getSessionIdFromCookie(): Promise<string> {
  // next-auth stores the JWT as __Secure-next-auth.session-token (HTTPS)
  // or next-auth.session-token (HTTP). We decode just the `sub` claim.
  try {
    // Use dynamic import to avoid bundling jwt in the client
    const { getToken } = await import('next-auth/jwt');
    const { headers: getHeaders } = await import('next/headers');
    const hdrs = await getHeaders();
    // Build a real NextRequest object using the actual headers from the context.
    // This satisfies getToken's requirement for a request object while ensuring
    // that standard Headers methods like .has() and .get() are available, even
    // when next-auth performs extra checks behind a reverse proxy.
    const req = new NextRequest('http://localhost', {
      headers: hdrs,
    });

    const token = await getToken({ req: req as any, secret: getSecret() });
    return token?.sub ?? '';
  } catch {
    return '';
  }
}

async function getVisitorIdFromCookie(): Promise<string> {
  return (await readCookieValue('visitor-id')) ?? '';
}

/**
 * Validate the CSRF token submitted in a FormData payload against the
 * cookie and the current session. Drop-in replacement for the old
 * `validateCsrf(formData)` — all server action call sites remain unchanged.
 */
export async function validateCsrf(formData: FormData): Promise<boolean> {
  const token = String(formData.get('csrfToken') ?? '');
  if (!token) return false;

  const sessionId = await getSessionIdFromCookie();
  if (sessionId) {
    const cookie = await readCookieValue('XSRF-TOKEN');
    if (!cookie || cookie !== token) return false;
    return validateCsrfToken(token, sessionId);
  }

  // Fallback to public/visitor-bound validation if no session exists.
  return validatePublicCsrf(formData);
}

/**
 * Explicitly validate CSRF for unauthenticated routes using the visitor identity.
 */
export async function validatePublicCsrf(formData: FormData): Promise<boolean> {
  const token = String(formData.get('csrfToken') ?? '');
  if (!token) return false;

  const cookie = await readCookieValue('XSRF-TOKEN-PUBLIC');
  if (!cookie || cookie !== token) return false;

  const visitorId = await getVisitorIdFromCookie();
  if (!visitorId) return false;

  return validatePublicCsrfToken(token, visitorId);
}

/**
 * Validate CSRF for standard API requests. Reads the `x-csrf-token` header
 * and compares it to the `XSRF-TOKEN` cookie and the session-bound HMAC.
 */
export async function validateApiCsrf(request: NextRequest): Promise<boolean> {
  try {
    const token = String(request.headers.get('x-csrf-token') ?? '');
    if (!token) return false;

    const cookieVal = request.cookies.get('XSRF-TOKEN')?.value ?? null;
    if (!cookieVal || cookieVal !== token) return false;

    const { getToken } = await import('next-auth/jwt');
    const req = new NextRequest(request.url, {
      headers: request.headers,
    });

    const tokenObj = await getToken({ req, secret: getSecret() });
    const sessionId = tokenObj?.sub ?? '';
    if (!sessionId) return false;

    return validateCsrfToken(token, sessionId);
  } catch {
    return false;
  }
}

/**
 * Flexible CSRF validation for Server Actions.
 * Checks for token in headers (x-csrf-token) or formData (csrfToken).
 */
export async function validateActionCsrf(formData?: FormData): Promise<boolean> {
  const { headers: getHeaders } = await import('next/headers');
  const hdrs = await getHeaders();

  // 1. Try header first (most robust for non-form calls)
  let token = hdrs.get('x-csrf-token');

  // 2. Fallback to formData if provided
  if (!token && formData) {
    token = String(formData.get('csrfToken') ?? '');
  }

  if (!token) return false;

  const sessionId = await getSessionIdFromCookie();
  if (sessionId) {
    const cookie = await readCookieValue('XSRF-TOKEN');
    if (!cookie || cookie !== token) return false;
    return validateCsrfToken(token, sessionId);
  }

  // Support public CSRF as well
  const visitorId = await getVisitorIdFromCookie();
  if (visitorId) {
    const cookie = await readCookieValue('XSRF-TOKEN-PUBLIC');
    if (!cookie || cookie !== token) return false;
    return validatePublicCsrfToken(token, visitorId);
  }

  return false;
}
