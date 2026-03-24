import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindUnique = vi.fn();

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...a: any[]) => mockFindUnique(...a),
    }
  }
}));

let mockRedisClient: any = null;
vi.mock('../src/lib/redis', () => ({
  getSharedRedisClient: vi.fn(async () => mockRedisClient),
  _setSharedRedisClientForTest: vi.fn(),
}));

describe('userCache – gap coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockRedisClient = null;
  });

  it('getUserMeta returns null for empty userId', async () => {
    const { getUserMeta } = await import('../src/lib/userCache');
    const result = await getUserMeta('');
    expect(result).toBeNull();
  });

  it('getUserMeta falls back to DB when redis unavailable (non-test mode)', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    mockRedisClient = null;
    mockFindUnique.mockResolvedValue({
      roles: [{ role: { name: 'user' } }],
      mustChangePassword: false,
      updatedAt: new Date(),
      securityStamp: null,
      image: null
    });
    const { getUserMeta } = await import('../src/lib/userCache');
    const result = await getUserMeta('user-1');
    expect(result).not.toBeNull();
    expect(result!.roles).toEqual(['user']);
    vi.unstubAllEnvs();
  });

  it('getUserMeta reads from Redis when available (non-test mode)', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const meta = { roles: ['admin'], mustChangePassword: false };
    mockRedisClient = {
      get: vi.fn().mockResolvedValue(JSON.stringify(meta)),
      set: vi.fn().mockResolvedValue('OK'),
    };
    const { getUserMeta } = await import('../src/lib/userCache');
    const result = await getUserMeta('user-1');
    expect(result).toEqual(meta);
    vi.unstubAllEnvs();
  });

  it('getUserMeta fetches from DB and caches on Redis miss (non-test mode)', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    mockRedisClient = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
    };
    mockFindUnique.mockResolvedValue({
      roles: [{ role: { name: 'editor' } }],
      mustChangePassword: true,
      updatedAt: new Date(),
      securityStamp: new Date(),
      image: '/img.png'
    });
    const { getUserMeta } = await import('../src/lib/userCache');
    const result = await getUserMeta('user-1');
    expect(result!.roles).toEqual(['editor']);
    expect(result!.mustChangePassword).toBe(true);
    expect(mockRedisClient.set).toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it('getUserMeta returns null on DB miss after Redis miss (non-test mode)', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    mockRedisClient = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
    };
    mockFindUnique.mockResolvedValue(null);
    const { getUserMeta } = await import('../src/lib/userCache');
    const result = await getUserMeta('nonexistent');
    expect(result).toBeNull();
    vi.unstubAllEnvs();
  });

  it('getUserMeta returns null on Redis get error in non-production', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    mockRedisClient = {
      get: vi.fn().mockRejectedValue(new Error('Redis error')),
      set: vi.fn(),
    };
    const { getUserMeta } = await import('../src/lib/userCache');
    const result = await getUserMeta('user-1');
    expect(result).toBeNull();
    vi.unstubAllEnvs();
  });

  it('getUserMeta ignores cache write failure (non-test mode)', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    mockRedisClient = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockRejectedValue(new Error('Write error')),
    };
    mockFindUnique.mockResolvedValue({
      roles: [{ role: { name: 'user' } }],
      mustChangePassword: false,
      updatedAt: null,
      securityStamp: null,
      image: null
    });
    const { getUserMeta } = await import('../src/lib/userCache');
    const result = await getUserMeta('user-1');
    expect(result!.roles).toEqual(['user']);
    vi.unstubAllEnvs();
  });

  it('invalidateUserMeta does nothing when redis is unavailable', async () => {
    mockRedisClient = null;
    const { invalidateUserMeta } = await import('../src/lib/userCache');
    await invalidateUserMeta('user-123');
  });

  it('invalidateUserMeta handles Redis timeout gracefully', async () => {
    mockRedisClient = {
      del: vi.fn().mockImplementation(() => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)))
    };
    const { invalidateUserMeta } = await import('../src/lib/userCache');
    await invalidateUserMeta('user-123');
  });

  it('clearMemCache clears the memory cache', async () => {
    const { setUserMetaForTest, clearMemCache, getUserMeta } = await import('../src/lib/userCache');
    setUserMetaForTest('clear-test', { roles: ['admin'], mustChangePassword: false, securityStamp: null, updatedAt: new Date().toISOString(), image: null });
    const before = await getUserMeta('clear-test');
    expect(before).not.toBeNull();
    clearMemCache();
    // After clear, test-mode call will check memCache (empty) and fall through to DB
    mockFindUnique.mockResolvedValue(null);
    const after = await getUserMeta('clear-test');
    expect(after).toBeNull();
  });

  it('setRedisClient delegates to _setSharedRedisClientForTest', async () => {
    const mod = await import('../src/lib/userCache');
    const redis = await import('../src/lib/redis');
    const fakeClient = { ping: vi.fn() } as any;
    mod.setRedisClient(fakeClient);
    expect(vi.mocked(redis._setSharedRedisClientForTest)).toHaveBeenCalledWith(fakeClient);
  });
});
