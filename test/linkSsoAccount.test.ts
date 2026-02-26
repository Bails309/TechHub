import { describe, it, expect, vi } from 'vitest';

// Top-level mocks to ensure module resolution doesn't attempt to load real
// backend modules during bundling of the tested module.
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual('@/lib/auth');
  return { ...actual, getServerAuthSession: async () => ({ user: { id: 'admin-1', roles: ['admin'] } }) };
});
vi.mock('@/lib/csrf', () => ({ validateCsrf: async () => true }));
vi.mock('@/lib/storage', () => ({ saveIcon: async () => null, deleteIcon: async () => {} }));
vi.mock('@/lib/crypto', async () => ({ ...(await vi.importActual('../src/lib/crypto')) }));

describe('linkSsoAccount transactionality', () => {

  it.skip('throws when the transactional audit insert fails (fail-closed)', async () => {
    // Mock prisma to return expected rows and make $transaction throw
    const fakePrisma: any = {
      user: { findUnique: async () => ({ id: 'user-1', email: 'u@example.com' }) },
      account: { findUnique: async () => null, findFirst: async () => null },
      passwordHistory: { deleteMany: async () => {} },
      $transaction: async () => { throw new Error('simulated audit failure'); }
    };
    vi.mock('@/lib/prisma', () => ({ prisma: fakePrisma }));

    const { linkSsoAccount } = await import('../src/app/admin/actions');

    const formData = {
      get: (k: string) => {
        if (k === 'email') return 'u@example.com';
        if (k === 'provider') return 'azure-ad';
        if (k === 'providerAccountId') return 'prov-123';
        return '';
      },
      getAll: (_: string) => []
    } as unknown as FormData;

    await expect(linkSsoAccount({ status: 'idle', message: '' }, formData)).rejects.toThrow('simulated audit failure');
  });
});
