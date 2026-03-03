import Redis, { RedisOptions } from 'ioredis';
import { prisma } from './prisma';

import { getSharedRedisClient, _setSharedRedisClientForTest } from './redis';

type UserMeta = { roles: string[]; mustChangePassword: boolean; securityStamp?: number; updatedAt?: number; image?: string | null };

const TTL_SECONDS = Number(process.env.USER_META_CACHE_TTL_SEC ?? 300);

async function fetchFromDb(userId: string): Promise<UserMeta | null> {
  // @ts-ignore - stale prisma types in IDE
  const rec = await prisma.user.findUnique({
    where: { id: userId },
    // @ts-ignore - stale prisma types in IDE
    select: { roles: { include: { role: true } }, mustChangePassword: true, updatedAt: true, securityStamp: true, image: true }
  });
  if (!rec) return null;
  return {
    // @ts-ignore - stale prisma types in IDE
    roles: rec.roles.map((r: any) => r.role.name),
    mustChangePassword: !!rec.mustChangePassword,
    // @ts-ignore - stale prisma types in IDE
    updatedAt: rec.updatedAt ? new Date(rec.updatedAt as any).getTime() : undefined,
    // @ts-ignore - stale prisma types in IDE
    securityStamp: rec.securityStamp ? new Date(rec.securityStamp as any).getTime() : undefined,
    image: rec.image
  };
}

// In tests we allow a volatile in-memory cache for convenience. Production
// builds require Redis and will throw if `REDIS_URL` is not set.
const memCache = new Map<string, { value: UserMeta; expiresAt: number }>();

export async function getUserMeta(userId: string): Promise<UserMeta | null> {
  if (!userId) return null;

  // Short-circuit to memCache in test mode if explicitly seeded.
  if (process.env.NODE_ENV === 'test') {
    const entry = memCache.get(userId);
    if (entry && entry.expiresAt > Date.now()) return entry.value;
    // Fall back to database if not explicitly seeded in tests.
    return await fetchFromDb(userId);
  }

  const client = await getSharedRedisClient();
  if (!client) {
    console.warn('[REDIS] Client unavailable - falling back to direct database read for user metadata');
    return await fetchFromDb(userId);
  }

  try {
    const raw = await client.get(`user:meta:${userId}`);
    if (raw) return JSON.parse(raw) as UserMeta;
  } catch (e) {
    if (process.env.NODE_ENV === 'production') throw e;
    return null;
  }

  const fromDb = await fetchFromDb(userId);
  if (!fromDb) return null;

  try {
    await client.set(`user:meta:${userId}`, JSON.stringify(fromDb), 'EX', TTL_SECONDS);
  } catch {
    // ignore cache write failures
  }

  return fromDb;
}

export async function invalidateUserMeta(userId: string) {
  const client = await getSharedRedisClient();
  if (!client) return;
  try {
    await Promise.race([
      client.del(`user:meta:${userId}`),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Redis del timeout')), 1000))
    ]);
  } catch (err) {
    console.warn(`[REDIS] Failed to invalidate cache for user ${userId}`, err);
  }
}

// Testing helpers
export function setUserMetaForTest(userId: string, meta: UserMeta, ttlSec = TTL_SECONDS) {
  const now = Date.now();
  memCache.set(userId, { value: meta, expiresAt: now + ttlSec * 1000 });
}

export function clearMemCache() {
  memCache.clear();
}

export function setRedisClient(client: Redis | null) {
  _setSharedRedisClientForTest(client as any);
}

const userCache = { getUserMeta, invalidateUserMeta, setUserMetaForTest, setRedisClient, clearMemCache };

export default userCache;
