import { cookies } from 'next/headers';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

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
  const nonce = randomBytes(32).toString('hex');
  const sig = createHmac('sha256', getSecret())
    .update(nonce + ':' + sessionId)
    .digest('hex');
  return nonce + '.' + sig;
}

/**
 * Verify that `token` is a valid HMAC-signed token for `sessionId`.
 * Uses timingSafeEqual to prevent timing side-channels.
 */
export function validateCsrfToken(token: string, sessionId: string): boolean {
  const secret = getSecret();
  if (!token || !sessionId || !secret) return false;

  const dotIdx = token.indexOf('.');
  if (dotIdx < 1) return false;

  const nonce = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  if (!nonce || !sig) return false;

  const expected = createHmac('sha256', secret)
    .update(nonce + ':' + sessionId)
    .digest('hex');

  // Both values are hex strings; compare as buffers for constant-time safety.
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

    // Build a minimal request-like object that getToken can read cookies from.
    const cookieHeader = hdrs.get('cookie') ?? '';
    const req = {
      headers: { cookie: cookieHeader },
      cookies: Object.fromEntries(
        cookieHeader.split(';').map((c) => {
          const [k, ...v] = c.trim().split('=');
          return [k, v.join('=')];
        })
      ),
    };

    const token = await getToken({ req: req as any, secret: getSecret() });
    return token?.sub ?? '';
  } catch {
    return '';
  }
}

/**
 * Validate the CSRF token submitted in a FormData payload against the
 * cookie and the current session. Drop-in replacement for the old
 * `validateCsrf(formData)` — all server action call sites remain unchanged.
 */
export async function validateCsrf(formData: FormData): Promise<boolean> {
  const token = String(formData.get('csrfToken') ?? '');
  if (!token) return false;

  const cookie = await readCookieValue('XSRF-TOKEN');
  if (!cookie || cookie !== token) return false;

  const sessionId = await getSessionIdFromCookie();
  if (!sessionId) return false;

  return validateCsrfToken(token, sessionId);
}
