/**
 * Concurrent-session tracker backed by Redis sorted sets.
 *
 * Each user gets a sorted set  `sessions:{userId}`  where:
 *   member = JTI (unique token identifier)
 *   score  = expiry timestamp (ms)
 *
 * On login the new JTI is added; on logout / revocation it is removed.
 * Expired members are pruned on every read so the count stays accurate
 * without requiring a background cleanup job.
 *
 * When Redis is unavailable the tracker is a silent no-op — the rest of
 * the auth pipeline continues to work exactly as before.
 */

import { getSharedRedisClient } from './redis';
import { writeAuditLog } from './audit';

const KEY_PREFIX = 'sessions:';

function key(userId: string) {
  return `${KEY_PREFIX}${userId}`;
}

/** Register a new session for a user.  Returns the count of active sessions *after* registration. */
export async function trackSession(
  userId: string,
  jti: string,
  expiresAtMs: number,
  ip?: string | null,
  provider?: string | null,
): Promise<number> {
  const client = await getSharedRedisClient();
  if (!client) return 0;

  try {
    const k = key(userId);
    const now = Date.now();

    // Prune expired sessions first
    await client.zremrangebyscore(k, '-inf', String(now));

    // Count existing active sessions BEFORE adding the new one
    const existingCount = await client.zcard(k);

    // Add the new session
    await client.zadd(k, String(expiresAtMs), jti);

    // Set a TTL on the whole key so it doesn't linger forever.
    // Use the session max age + a small buffer.
    const ttlSec = Math.ceil((expiresAtMs - now) / 1000) + 60;
    if (ttlSec > 0) await client.expire(k, ttlSec);

    const totalCount = existingCount + 1;

    // Audit-log concurrent login if other sessions already existed
    if (existingCount > 0) {
      await writeAuditLog({
        category: 'auth',
        action: 'concurrent_login_detected',
        actorId: userId,
        ip: ip ?? undefined,
        provider: provider ?? undefined,
        details: { activeSessions: totalCount },
      });
    }

    return totalCount;
  } catch (err) {
    console.warn('[SESSION-TRACKER] Failed to track session', err);
    return 0;
  }
}

/** Remove a session (on explicit logout or revocation). */
export async function untrackSession(userId: string, jti: string): Promise<void> {
  const client = await getSharedRedisClient();
  if (!client) return;

  try {
    await client.zrem(key(userId), jti);
  } catch (err) {
    console.warn('[SESSION-TRACKER] Failed to untrack session', err);
  }
}

/**
 * Return the number of active (non-expired) sessions for a user.
 * Prunes stale entries as a side-effect.
 */
export async function countActiveSessions(userId: string): Promise<number> {
  const client = await getSharedRedisClient();
  if (!client) return 0;

  try {
    const k = key(userId);
    await client.zremrangebyscore(k, '-inf', String(Date.now()));
    return await client.zcard(k);
  } catch (err) {
    console.warn('[SESSION-TRACKER] Failed to count sessions', err);
    return 0;
  }
}
