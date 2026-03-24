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

/**
 * Heartbeat window (ms).  Each active browser tab refreshes its entry on
 * every periodic JWT check (~5 min via JWT_CHECK_INTERVAL_MS).  If a tab
 * is closed without an explicit logout the entry expires after this window
 * and gets pruned on the next read.
 */
const HEARTBEAT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Maximum plausible score for a session entry.  Anything beyond
 * `now + HEARTBEAT_WINDOW_MS + PRUNE_BUFFER_MS` is a legacy artifact
 * from the pre-heartbeat code that used JWT expiry (up to 30 days)
 * as the sorted-set score.  We prune these on every read so the
 * count stays accurate after a code upgrade.
 */
const PRUNE_BUFFER_MS = 2 * 60 * 1000; // 2 minutes grace

function key(userId: string) {
  return `${KEY_PREFIX}${userId}`;
}

/** Prune expired entries AND legacy entries with unreasonably far-future scores. Returns count removed. */
async function pruneStale(client: any, k: string, now: number): Promise<number> {
  // Remove entries that have already expired (score < now)
  const expiredRemoved: number = await client.zremrangebyscore(k, '-inf', String(now));
  // Remove legacy entries whose score is beyond the heartbeat window.
  // These are leftovers from the old code that used JWT expiry as the score.
  const maxPlausible = now + HEARTBEAT_WINDOW_MS + PRUNE_BUFFER_MS;
  const legacyRemoved: number = await client.zremrangebyscore(k, String(maxPlausible), '+inf');
  const total = (expiredRemoved || 0) + (legacyRemoved || 0);
  if (process.env.NODE_ENV === 'production' && total > 0) {
    console.log('[SESSION-TRACKER] pruneStale key=%s expired=%d legacy=%d', k, expiredRemoved, legacyRemoved);
  }
  return total;
}

/** Register a new session for a user.  Returns the count of active sessions *after* registration. */
export async function trackSession(
  userId: string,
  jti: string,
  _expiresAtMs: number,
  ip?: string | null,
  provider?: string | null,
): Promise<number> {
  const client = await getSharedRedisClient();
  if (!client) return 0;

  try {
    const k = key(userId);
    const now = Date.now();

    // Prune expired sessions and legacy far-future entries
    await pruneStale(client, k, now);

    // Count existing active sessions BEFORE adding the new one
    const existingCount = await client.zcard(k);

    // Add the new session with a heartbeat-based expiry.
    // Active tabs refresh their score periodically; closed tabs expire naturally.
    const score = now + HEARTBEAT_WINDOW_MS;
    await client.zadd(k, String(score), jti);

    // Key TTL: heartbeat window + buffer so the set auto-deletes
    // when no sessions are refreshed.
    const ttlSec = Math.ceil(HEARTBEAT_WINDOW_MS / 1000) + 120;
    if (ttlSec > 0) await client.expire(k, ttlSec);

    const totalCount = existingCount + 1;

    console.log('[SESSION-TRACKER] trackSession userId=%s jti=%s existingBefore=%d totalAfter=%d', userId, jti, existingCount, totalCount);

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

/**
 * Refresh a session's heartbeat and return the active session count.
 * Called periodically from the JWT callback to keep the entry alive.
 * Also re-registers sessions that expired while the tab was idle.
 */
export async function refreshSession(userId: string, jti: string): Promise<number> {
  const client = await getSharedRedisClient();
  if (!client) return 0;

  try {
    const k = key(userId);
    const now = Date.now();

    // Prune expired sessions and legacy far-future entries
    await pruneStale(client, k, now);

    // Refresh (or re-register) this session's heartbeat score
    await client.zadd(k, String(now + HEARTBEAT_WINDOW_MS), jti);

    // Extend key TTL
    await client.expire(k, Math.ceil(HEARTBEAT_WINDOW_MS / 1000) + 120);

    return await client.zcard(k);
  } catch (err) {
    console.warn('[SESSION-TRACKER] Failed to refresh session', err);
    return 0;
  }
}

/** Remove a session (on explicit logout or revocation). */
export async function untrackSession(userId: string, jti: string): Promise<void> {
  const client = await getSharedRedisClient();
  if (!client) {
    console.warn('[SESSION-TRACKER] untrackSession: no Redis client for userId=%s jti=%s', userId, jti);
    return;
  }

  try {
    const k = key(userId);
    const removed = await client.zrem(k, jti);
    const remaining = await client.zcard(k);
    console.log('[SESSION-TRACKER] untrackSession userId=%s jti=%s removed=%d remaining=%d', userId, jti, removed, remaining);
  } catch (err) {
    console.warn('[SESSION-TRACKER] Failed to untrack session', err);
  }
}

/**
 * Remove ALL sessions for a user (e.g. admin "clear sessions" action).
 * Returns the number of entries removed.
 */
export async function clearAllSessions(userId: string): Promise<number> {
  const client = await getSharedRedisClient();
  if (!client) return 0;

  try {
    const k = key(userId);
    const count = await client.zcard(k);
    await client.del(k);
    if (process.env.NODE_ENV === 'production') {
      console.log('[SESSION-TRACKER] clearAllSessions userId=%s removed=%d', userId, count);
    }
    return count;
  } catch (err) {
    console.warn('[SESSION-TRACKER] Failed to clear all sessions', err);
    return 0;
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

/**
 * Return raw sorted-set entries for a user (admin diagnostics).
 * Each entry has { jti, score, expiresIn } where expiresIn is
 * milliseconds until the heartbeat score expires (negative = already expired).
 */
export async function getSessionEntries(userId: string): Promise<{ jti: string; score: number; expiresIn: number }[]> {
  const client = await getSharedRedisClient();
  if (!client) return [];

  try {
    const k = key(userId);
    // ZRANGE ... WITHSCORES returns [member, score, member, score, ...]
    const raw: string[] = await client.zrange(k, 0, -1, 'WITHSCORES');
    const now = Date.now();
    const entries: { jti: string; score: number; expiresIn: number }[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      const score = Number(raw[i + 1]);
      entries.push({ jti: raw[i], score, expiresIn: score - now });
    }
    return entries;
  } catch (err) {
    console.warn('[SESSION-TRACKER] Failed to get session entries', err);
    return [];
  }
}
