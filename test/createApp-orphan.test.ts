import { vi, describe, it, expect } from 'vitest';

// Mocks
// Provide a lightweight mock for Next's headers API used in some server modules
vi.mock('next/headers', () => ({
  headers: () => ({ get: (_: string) => undefined })
}));

// Mock next-auth's server helper to avoid calling Next runtime APIs in tests
vi.mock('next-auth', () => ({
  getServerSession: async () => ({ user: { id: 'admin', roles: ['admin'], authProvider: 'credentials', mustChangePassword: false } })
}));

// Provide no-op revalidation helpers so server actions can call them during tests
vi.mock('next/cache', () => ({
  revalidatePath: async (_: string) => {},
  revalidateTag: async (_: string) => {},
  unstable_cache: (fn: any) => {
    // Return the original function (no caching) for tests
    return (...args: any[]) => fn(...args);
  }
}));

const deleteIconMock = vi.fn();
const saveIconMock = vi.fn().mockResolvedValue('/uploads/fake.png');

vi.mock('@/lib/storage', () => ({
  saveIcon: saveIconMock,
  deleteIcon: deleteIconMock
}));

vi.mock('@/lib/auth', () => ({
  getServerAuthSession: async () => ({
    user: { id: 'admin', roles: ['admin'], authProvider: 'credentials', mustChangePassword: false }
  })
}));

// Mock crypto helpers used by admin actions so module can load cleanly
vi.mock('@/lib/crypto', () => ({
  encryptSecret: (v: string) => v,
  hasSecretKey: () => false,
  encryptSecretWithKeyId: (v: string) => v,
  getSecretKeyId: (_: string) => null,
  getCurrentKeyId: () => ''
}));

// Mock password helpers used by admin actions
vi.mock('@/lib/password', () => ({
  hashPassword: async (p: string) => `hashed:${p}`,
  validatePasswordComplexity: () => null
}));

vi.mock('@/lib/passwordPolicy', () => ({ getPasswordPolicy: async () => ({ historyCount: 3 }) }));

// Simulate a DB failure inside the transaction
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: async (_fn: any) => {
      throw new Error('simulated-db-failure');
    }
  }
}));

describe('createApp orphaned icon cleanup', () => {
  it('removes uploaded icon when DB transaction fails', async () => {
    // Provide a minimal File polyfill so z.instanceof(File) checks pass
    // (the actions module validates the upload with z.instanceof(File)).
    // Keep this simple: it only needs a .name, .type, .size and arrayBuffer().
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    global.File = class {
      name: string;
      type: string;
      size: number;
      _buf: Uint8Array;
      constructor(name: string, opts?: { type?: string; buffer?: Uint8Array }) {
        this.name = name;
        this.type = opts?.type || 'image/png';
        this._buf = opts?.buffer || Uint8Array.from([1, 2, 3]);
        this.size = this._buf.length;
      }
      async arrayBuffer() {
        return this._buf.buffer;
      }
    } as any;

    const { createApp } = await import('../src/app/admin/actions');

    const form = {
      get: (k: string) => {
        if (k === 'name') return 'AppName';
        if (k === 'url') return 'https://example.com';
        if (k === 'audience') return 'PUBLIC';
        if (k === 'icon') return new (global as any).File('icon.png', { type: 'image/png', buffer: Uint8Array.from([1, 2, 3]) });
        return '';
      },
      getAll: (_k: string) => []
    } as unknown as FormData;

    try {
      await createApp(form);
      throw new Error('createApp did not throw');
    } catch (err) {
      // Print full stack for debugging where the headers() call originates
      // eslint-disable-next-line no-console
      console.error('createApp threw:', err && (err as Error).stack ? (err as Error).stack : err);
      expect(String(err)).toContain('simulated-db-failure');
    }

    // Ensure upload was attempted and the uploaded icon was removed on failure
    expect(saveIconMock).toHaveBeenCalled();
    expect(deleteIconMock).toHaveBeenCalledWith('/uploads/fake.png');
  });
});
