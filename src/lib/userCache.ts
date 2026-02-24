import Redis from 'ioredis';
import { prisma } from './prisma';

type UserMeta = { roles: string[]; mustChangePassword: boolean; updatedAt?: number };

const REDIS_URL = process.env.REDIS_URL ?? '';
const TTL_SECONDS = Number(process.env.USER_META_CACHE_TTL_SEC ?? 300);

let redis: Redis | null = null;
function getRedisClient(): Redis | null {
  if (redis) return redis;
  if (!REDIS_URL) return null;
  try {
    redis = new Redis(REDIS_URL);
    // swallow errors; fallback to in-memory cache on failure
    redis.on('error', () => {});
    return redis;
  } catch {
    redis = null;
    return null;
  }
}

// In-memory fallback cache: Map<userId, { value: UserMeta; expiresAt: number }>
const memCache = new Map<string, { value: UserMeta; expiresAt: number }>();

async function fetchFromDb(userId: string): Promise<UserMeta | null> {
  const rec = await prisma.user.findUnique({
    where: { id: userId },
    select: { roles: { include: { role: true } }, mustChangePassword: true, updatedAt: true }
  });
  if (!rec) return null;
  return { roles: rec.roles.map((r) => r.role.name), mustChangePassword: !!rec.mustChangePassword, updatedAt: rec.updatedAt ? new Date(rec.updatedAt).getTime() : undefined };
}

export async function getUserMeta(userId: string): Promise<UserMeta | null> {
  if (!userId) return null;

  // Try in-memory cache first
  const now = Date.now();
  const mem = memCache.get(userId);
  if (mem && mem.expiresAt > now) return mem.value;

  // Try Redis
  const client = getRedisClient();
  if (client) {
    try {
      const raw = await client.get(`user:meta:${userId}`);
      if (raw) {
        const parsed = JSON.parse(raw) as UserMeta;
        // populate mem cache
        memCache.set(userId, { value: parsed, expiresAt: now + TTL_SECONDS * 1000 });
        return parsed;
      }
    } catch {
      // ignore and fall back to DB
    }
  }

  // Fetch from DB and populate caches
  const fromDb = await fetchFromDb(userId);
  if (!fromDb) return null;

  // populate caches
  memCache.set(userId, { value: fromDb, expiresAt: now + TTL_SECONDS * 1000 });
  const client2 = getRedisClient();
  if (client2) {
    try {
      await client2.set(`user:meta:${userId}`, JSON.stringify(fromDb), 'EX', TTL_SECONDS);
    } catch {
      // ignore redis set errors
    }
  }

  return fromDb;
}

export async function invalidateUserMeta(userId: string) {
  memCache.delete(userId);
  const client3 = getRedisClient();
  if (client3) {
    try {
      await client3.del(`user:meta:${userId}`);
    } catch {
      // ignore
    }
  }
}

export function setUserMetaForTest(userId: string, meta: UserMeta, ttlSec = TTL_SECONDS) {
  const now = Date.now();
  memCache.set(userId, { value: meta, expiresAt: now + ttlSec * 1000 });
}

// Testing / DI helpers
export function setRedisClient(client: Redis | null) {
  // allow tests to inject a mock instance or null
  // close existing client if present
  if (redis && client !== redis) {
    try {
      redis.disconnect();
    } catch {
      /* ignore */
    }
  }
  redis = client;
}

export function clearMemCache() {
  memCache.clear();
}

export default { getUserMeta, invalidateUserMeta, setUserMetaForTest, setRedisClient, clearMemCache };
