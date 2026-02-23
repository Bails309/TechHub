import { describe, it, expect, vi } from 'vitest';

// Mock an admin session that requires password change
vi.mock('@/lib/auth', () => ({
  getServerAuthSession: async () => ({
    user: { id: 'admin1', roles: ['admin'], mustChangePassword: true, authProvider: 'credentials' }
  })
}));

// Minimal mocks for prisma and storage so module loads cleanly
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/storage', () => ({ saveIcon: async () => '/uploads/fake.png', deleteIcon: async () => {} }));

describe('admin server actions must-change-password enforcement', () => {
  it('createApp throws when mustChangePassword is set', async () => {
    const { createApp } = await import('../src/app/admin/actions');
    const form = { get: () => null, getAll: () => [] } as unknown as FormData;
    await expect(createApp(form)).rejects.toThrow('Unauthorized: must_change_password');
  });

  it('deleteApp throws when mustChangePassword is set', async () => {
    const { deleteApp } = await import('../src/app/admin/actions');
    const form = { get: () => 'some-id' } as unknown as FormData;
    await expect(deleteApp(form)).rejects.toThrow('Unauthorized: must_change_password');
  });

  it('updateApp throws when mustChangePassword is set', async () => {
    const { updateApp } = await import('../src/app/admin/actions');
    const form = { get: () => null, getAll: () => [] } as unknown as FormData;
    await expect(updateApp(form)).rejects.toThrow('Unauthorized: must_change_password');
  });
});
