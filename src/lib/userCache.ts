import Redis from 'ioredis';
import { prisma } from './prisma';

type UserMeta = { roles: string[]; mustChangePassword: boolean; updatedAt?: number };

const REDIS_URL = process.env.REDIS_URL ?? '';
const TTL_SECONDS = Number(process.env.USER_META_CACHE_TTL_SEC ?? 300);

let redis: Redis | null = null;
let redisInitPromise: Promise<Redis | null> | null = null;

async function initRedisClient(): Promise<Redis | null> {
  if (redis) return redis;
  if (redisInitPromise) return redisInitPromise;

  if (!REDIS_URL && process.env.NODE_ENV === 'production') {
    throw new Error('REDIS_URL is not configured; Redis is required');
  }

  redisInitPromise = (async () => {
    try {
      const client = REDIS_URL ? new Redis(REDIS_URL) : new Redis();
      client.on('error', () => {});
      await client.ping();
      redis = client;
      return client;
    } catch (e) {
      redis = null;
      if (process.env.NODE_ENV === 'production') {
        throw new Error('Failed to connect to Redis: ' + (e instanceof Error ? e.message : String(e)));
      }
      return null;
    } finally {
      redisInitPromise = null;
    }
  })();

  return redisInitPromise;
}

async function fetchFromDb(userId: string): Promise<UserMeta | null> {
  const rec = await prisma.user.findUnique({
    where: { id: userId },
    select: { roles: { include: { role: true } }, mustChangePassword: true, updatedAt: true }
  });
  if (!rec) return null;
  return {
    roles: rec.roles.map((r) => r.role.name),
    mustChangePassword: !!rec.mustChangePassword,
    updatedAt: rec.updatedAt ? new Date(rec.updatedAt).getTime() : undefined
  };
}

// In tests we allow a volatile in-memory cache for convenience. Production
// builds require Redis and will throw if `REDIS_URL` is not set.
const memCache = new Map<string, { value: UserMeta; expiresAt: number }>();

export async function getUserMeta(userId: string): Promise<UserMeta | null> {
  if (!userId) return null;

  // Short-circuit to memCache in tests to avoid requiring Redis during unit tests.
  if (process.env.NODE_ENV === 'test') {
    const entry = memCache.get(userId);
    if (entry && entry.expiresAt > Date.now()) return entry.value;
    // If tests didn't seed the mem cache, return null so callers fall back to DB.
    return null;
  }

  const client = await initRedisClient();
  if (!client) return null;

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
  const client = await initRedisClient();
  if (!client) return;
  await client.del(`user:meta:${userId}`);
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
  if (redis && client !== redis) {
    try {
      redis.disconnect();
    } catch {
      /* ignore */
    }
  }
  redis = client;
}

const userCache = { getUserMeta, invalidateUserMeta, setUserMetaForTest, setRedisClient, clearMemCache };

export default userCache;
