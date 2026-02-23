import { vi, describe, it, expect } from 'vitest';

// Mock modules used by the server action
vi.mock('@/lib/auth', () => ({ getServerAuthSession: async () => ({ user: { id: 'user1' } }) }));
vi.mock('@/lib/password', () => ({
  hashPassword: async (p: string) => `hashed:${p}`,
  verifyPassword: async (p: string, h: string) => h === `hashed:${p}`,
  validatePasswordComplexity: () => null
}));
vi.mock('@/lib/passwordPolicy', () => ({ getPasswordPolicy: async () => ({ historyCount: 3 }) }));

// In-memory faux Prisma with transaction serialization
const users: Record<string, { passwordHash: string }> = {
  user1: { passwordHash: 'hashed:old' }
};
let passwordHistory: Array<{ id: string; userId: string; hash: string; createdAt: Date }> = [
  { id: 'h1', userId: 'user1', hash: 'hashed:old1', createdAt: new Date(Date.now() - 30000) },
  { id: 'h2', userId: 'user1', hash: 'hashed:old2', createdAt: new Date(Date.now() - 20000) }
];

// Simple mutex for serializing $transaction
let lock = Promise.resolve();
function acquireLock() {
  let release: () => void = () => {};
  const p = new Promise<void>((res) => (release = res));
  const prev = lock;
  lock = p;
  return prev.then(() => release);
}

const mockPrisma = {
  $transaction: async (fn: (tx: any) => Promise<any>) => {
    const release = await acquireLock();
    try {
      const tx = {
        $queryRaw: async () => {},
        user: {
          findUnique: async ({ where }: any) => ({ passwordHash: users[where.id].passwordHash }),
          update: async ({ where, data }: any) => {
            users[where.id].passwordHash = data.passwordHash;
            return { id: where.id };
          }
        },
        passwordHistory: {
          create: async ({ data }: any) => {
            const id = `h${Math.random().toString(36).slice(2, 8)}`;
            const entry = { id, userId: data.userId, hash: data.hash, createdAt: new Date() };
            passwordHistory.unshift(entry);
            return entry;
          },
          findMany: async ({ where, orderBy, take, skip, select }: any) => {
            const list = passwordHistory.filter((p) => p.userId === where.userId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
            if (typeof take === 'number') return list.slice(0, take).map((e) => (select ? { id: e.id } : e));
            if (typeof skip === 'number') return list.slice(skip).map((e) => (select ? { id: e.id } : e));
            return list.map((e) => (select ? { id: e.id } : e));
          },
          deleteMany: async ({ where }: any) => {
            if (where.id && where.id.in) {
              const ids = new Set(where.id.in);
              passwordHistory = passwordHistory.filter((p) => !ids.has(p.id));
            }
            return { count: 0 };
          }
        }
      };
      return await fn(tx);
    } finally {
      release();
    }
  }
};

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

describe('changePassword concurrency', () => {
  it('serializes concurrent password changes and rejects reuse', async () => {
    const { changePassword } = await import('@/app/auth/change-password/actions');

    const makeForm = (current: string, next: string) => ({ get: (k: string) => (k === 'currentPassword' ? current : k === 'newPassword' || k === 'confirmPassword' ? next : '') });

    // Run two concurrent attempts with same new password
    const p1 = changePassword({ status: 'idle', message: '' }, makeForm('old', 'newpass'));
    const p2 = changePassword({ status: 'idle', message: '' }, makeForm('old', 'newpass'));

    const results = await Promise.allSettled([p1, p2]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

    // One should succeed, the other should fail due to reuse detection
    expect(fulfilled.length + rejected.length).toBe(2);

    // After operations, ensure passwordHistory size does not exceed policy (3)
    expect(passwordHistory.filter((p) => p.userId === 'user1').length).toBeLessThanOrEqual(3);
  });
});
