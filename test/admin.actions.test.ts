import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────
vi.mock('../src/lib/prisma', () => ({
  prisma: {
    appLink: { findUnique: vi.fn(), delete: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    siteConfig: { findFirst: vi.fn(), upsert: vi.fn() },
    storageConfig: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
    role: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), delete: vi.fn() },
    userRole: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn(), count: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn(), delete: vi.fn(), create: vi.fn(), update: vi.fn() },
    userAppAccess: { deleteMany: vi.fn(), createMany: vi.fn() },
    passwordPolicy: { upsert: vi.fn() },
    passwordHistory: { create: vi.fn() },
    ssoConfig: { findUnique: vi.fn(), upsert: vi.fn() },
    auditLog: { groupBy: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

vi.mock('../src/lib/auth', () => ({
  getServerAuthSession: vi.fn(),
}));

vi.mock('../src/lib/csrf', () => ({
  validateCsrf: vi.fn(),
}));

vi.mock('../src/lib/rateLimit', () => ({
  assertRateLimit: vi.fn(),
}));

vi.mock('../src/lib/audit', () => ({
  writeAuditLog: vi.fn(),
}));

vi.mock('../src/lib/storage', () => ({
  saveIcon: vi.fn(),
  deleteIcon: vi.fn(),
  cleanupOrphanedIcons: vi.fn(),
}));

vi.mock('../src/lib/userCache', () => ({
  invalidateUserMeta: vi.fn(),
}));

vi.mock('../src/lib/password', () => ({
  hashPassword: vi.fn().mockResolvedValue('hashed-pw'),
  validatePasswordComplexity: vi.fn().mockReturnValue(null),
}));

vi.mock('../src/lib/passwordPolicy', () => ({
  getPasswordPolicy: vi.fn().mockResolvedValue({ minLength: 12, requireUpper: true, requireLower: true, requireNumber: true, requireSymbol: true, historyCount: 5 }),
}));

vi.mock('../src/lib/crypto', () => ({
  encryptSecret: vi.fn().mockReturnValue('v2:encrypted'),
  decryptSecret: vi.fn().mockReturnValue('decrypted'),
  hasSecretKey: vi.fn().mockReturnValue(true),
}));

vi.mock('../src/lib/ssrf', () => ({
  assertUrlNotPrivate: vi.fn().mockResolvedValue('1.2.3.4'),
  isPublicIp: vi.fn().mockReturnValue(true),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => null, set: () => {} }),
}));

import { prisma } from '../src/lib/prisma';
import { getServerAuthSession } from '../src/lib/auth';
import { validateCsrf } from '../src/lib/csrf';
import { cleanupOrphanedIcons } from '../src/lib/storage';

// Import admin actions — uses dynamic import to handle the 'use server' directive
const adminModule = await import('../src/app/admin/actions');

const mockSession = getServerAuthSession as ReturnType<typeof vi.fn>;
const mockCsrf = validateCsrf as ReturnType<typeof vi.fn>;
const mockCleanup = cleanupOrphanedIcons as ReturnType<typeof vi.fn>;

function makeFormData(entries: Record<string, string | string[]>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) {
    if (Array.isArray(v)) {
      v.forEach((item) => fd.append(k, item));
    } else {
      fd.append(k, v);
    }
  }
  return fd;
}

const adminSession = {
  user: { id: 'admin-1', roles: ['admin'], mustChangePassword: false, authProvider: 'credentials' },
};

describe('Admin Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCsrf.mockResolvedValue(true);
    mockSession.mockResolvedValue(adminSession);
  });

  // ── Shared Guard Tests ────────────────────────────────────────────────
  describe('Shared Guards (via deleteApp)', () => {
    it('rejects on CSRF failure', async () => {
      mockCsrf.mockResolvedValue(false);
      const result = await adminModule.deleteApp(makeFormData({ id: 'app-1' }));
      expect(result.status).toBe('error');
      expect(result.message).toContain('CSRF');
    });

    it('rejects non-admin users', async () => {
      mockSession.mockResolvedValue({ user: { id: 'u1', roles: ['viewer'] } });
      const result = await adminModule.deleteApp(makeFormData({ id: 'app-1' }));
      expect(result.status).toBe('error');
    });
  });

  // ── deleteApp ──────────────────────────────────────────────────────────
  describe('deleteApp', () => {
    it('deletes an app successfully', async () => {
      (prisma.appLink.findUnique as any).mockResolvedValue({ id: 'app-1', icon: null });
      (prisma.appLink.delete as any).mockResolvedValue({});
      const result = await adminModule.deleteApp(makeFormData({ id: 'app-1' }));
      expect(result.status).toBe('success');
    });

    it('returns error for missing id', async () => {
      const result = await adminModule.deleteApp(makeFormData({}));
      expect(result.status).toBe('error');
    });
  });

  // ── triggerStorageCleanup ──────────────────────────────────────────────
  describe('triggerStorageCleanup', () => {
    it('cleans up orphaned icons and returns count', async () => {
      (prisma.appLink.findMany as any).mockResolvedValue([{ icon: '/uploads/a.png' }]);
      (prisma.siteConfig.findFirst as any).mockResolvedValue({ logoLight: '/uploads/logo.png', logoDark: null, faviconUrl: null, logo: null });
      mockCleanup.mockResolvedValue(5);
      const result = await adminModule.triggerStorageCleanup(makeFormData({}));
      expect(result.status).toBe('success');
      expect(result.message).toContain('5');
    });

    it('rejects non-admin', async () => {
      mockSession.mockResolvedValue({ user: { id: 'u', roles: [] } });
      const result = await adminModule.triggerStorageCleanup(makeFormData({}));
      expect(result.status).toBe('error');
    });
  });

  // ── createRole ─────────────────────────────────────────────────────────
  describe('createRole', () => {
    it('creates a role via upsert', async () => {
      (prisma.role.upsert as any).mockResolvedValue({ id: 'r1', name: 'editor' });
      const result = await adminModule.createRole(makeFormData({ name: 'Editor' }));
      expect(result.status).toBe('success');
    });

    it('rejects short role name', async () => {
      const result = await adminModule.createRole(makeFormData({ name: 'a' }));
      expect(result.status).toBe('error');
    });
  });

  // ── deleteRole ─────────────────────────────────────────────────────────
  describe('deleteRole', () => {
    it('deletes a role with no assignments', async () => {
      (prisma.role.findUnique as any).mockResolvedValue({ id: 'r1', name: 'editor' });
      (prisma.userRole.count as any).mockResolvedValue(0);
      (prisma.appLink.count as any).mockResolvedValue(0);
      (prisma.role.delete as any).mockResolvedValue({});
      const result = await adminModule.deleteRole(makeFormData({ roleId: 'r1' }));
      expect(result.status).toBe('success');
    });

    it('rejects deletion of admin role', async () => {
      (prisma.role.findUnique as any).mockResolvedValue({ id: 'r-admin', name: 'admin' });
      const result = await adminModule.deleteRole(makeFormData({ roleId: 'r-admin' }));
      expect(result.status).toBe('error');
      expect(result.message).toContain('admin');
    });

    it('rejects deletion of role with assignments', async () => {
      (prisma.role.findUnique as any).mockResolvedValue({ id: 'r1', name: 'editor' });
      (prisma.userRole.count as any).mockResolvedValue(3);
      (prisma.appLink.count as any).mockResolvedValue(0);
      const result = await adminModule.deleteRole(makeFormData({ roleId: 'r1' }));
      expect(result.status).toBe('error');
      expect(result.message).toContain('assigned');
    });

    it('returns error for missing roleId', async () => {
      const result = await adminModule.deleteRole(makeFormData({}));
      expect(result.status).toBe('error');
    });

    it('returns error when role not found', async () => {
      (prisma.role.findUnique as any).mockResolvedValue(null);
      const result = await adminModule.deleteRole(makeFormData({ roleId: 'nonexistent' }));
      expect(result.status).toBe('error');
    });
  });

  // ── searchUsers ────────────────────────────────────────────────────────
  describe('searchUsers', () => {
    it('returns matching users', async () => {
      (prisma.user.findMany as any).mockResolvedValue([
        { id: 'u1', name: 'Alice', email: 'alice@example.com' },
      ]);
      const result = await adminModule.searchUsers(makeFormData({ query: 'alice', limit: '10' }));
      expect(result).toHaveLength(1);
      expect(result[0].email).toBe('alice@example.com');
    });

    it('returns empty array for invalid query', async () => {
      const result = await adminModule.searchUsers(makeFormData({ query: '' }));
      expect(result).toEqual([]);
    });
  });

  // ── updatePasswordPolicy ───────────────────────────────────────────────
  describe('updatePasswordPolicy', () => {
    it('upserts a valid policy', async () => {
      (prisma.passwordPolicy.upsert as any).mockResolvedValue({});
      const result = await adminModule.updatePasswordPolicy(makeFormData({
        minLength: '12',
        requireUpper: 'true',
        requireLower: 'true',
        requireNumber: 'true',
        requireSymbol: 'true',
        historyCount: '5',
      }));
      expect(result.status).toBe('success');
    });

    it('rejects invalid policy values', async () => {
      const result = await adminModule.updatePasswordPolicy(makeFormData({
        minLength: '3', // too low (min 8)
        requireUpper: 'true',
        requireLower: 'true',
        requireNumber: 'true',
        requireSymbol: 'true',
        historyCount: '5',
      }));
      expect(result.status).toBe('error');
    });
  });

  // ── getAppLaunchStats ──────────────────────────────────────────────────
  describe('getAppLaunchStats', () => {
    it('returns top launched apps', async () => {
      (prisma.auditLog.groupBy as any).mockResolvedValue([
        { targetId: 'app-1', _count: { id: 10 } },
        { targetId: 'app-2', _count: { id: 5 } },
      ]);
      (prisma.appLink.findMany as any).mockResolvedValue([
        { id: 'app-1', name: 'App One' },
        { id: 'app-2', name: 'App Two' },
      ]);
      const result = await adminModule.getAppLaunchStats();
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('App One');
      expect(result[0].count).toBe(10);
    });

    it('rejects non-admin', async () => {
      mockSession.mockResolvedValue({ user: { id: 'u1', roles: ['viewer'] } });
      await expect(adminModule.getAppLaunchStats()).rejects.toThrow();
    });
  });

  // ── getUserActivityStats ───────────────────────────────────────────────
  describe('getUserActivityStats', () => {
    it('returns daily activity counts', async () => {
      (prisma.$queryRaw as any).mockResolvedValue([
        { date: '2026-03-22', count: 42 },
        { date: '2026-03-23', count: 18 },
      ]);
      const result = await adminModule.getUserActivityStats();
      expect(result).toHaveLength(2);
      expect(result[0].date).toBe('2026-03-22');
    });

    it('rejects non-admin', async () => {
      mockSession.mockResolvedValue({ user: { id: 'u1', roles: ['viewer'] } });
      await expect(adminModule.getUserActivityStats()).rejects.toThrow();
    });
  });

  // ── createLocalUser ────────────────────────────────────────────────────
  describe('createLocalUser', () => {
    it('creates a local user successfully', async () => {
      (prisma.role.findMany as any).mockResolvedValue([{ id: 'r1' }]);
      (prisma.$transaction as any).mockImplementation(async (fn: any) => {
        const tx = {
          user: { create: vi.fn().mockResolvedValue({ id: 'new-user-1' }) },
          userRole: { createMany: vi.fn() },
          passwordHistory: { create: vi.fn() },
        };
        return fn(tx);
      });

      const result = await adminModule.createLocalUser(
        { status: 'idle', message: '' },
        makeFormData({
          name: 'Test User',
          email: 'test@example.com',
          password: 'StrongP@ss123!',
          roleIds: ['r1'],
        })
      );
      expect(result.status).toBe('success');
    });

    it('rejects without admin session', async () => {
      mockSession.mockResolvedValue({ user: { id: 'u1', roles: ['viewer'] } });
      const result = await adminModule.createLocalUser(
        { status: 'idle', message: '' },
        makeFormData({ name: 'X', email: 'x@y.com', password: 'P@ssword123!' })
      );
      expect(result.status).toBe('error');
    });

    it('rejects invalid email', async () => {
      const result = await adminModule.createLocalUser(
        { status: 'idle', message: '' },
        makeFormData({ name: 'Test', email: 'not-an-email', password: 'P@ssword123!' })
      );
      expect(result.status).toBe('error');
    });
  });

  // ── deleteUser ─────────────────────────────────────────────────────────
  describe('deleteUser', () => {
    it('rejects self-deletion', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({ id: 'admin-1', email: 'admin@example.com' });
      const result = await adminModule.deleteUser(makeFormData({
        userId: 'admin-1',
        confirmEmail: 'admin@example.com',
      }));
      expect(result.status).toBe('error');
      expect(result.message).toContain('self');
    });

    it('rejects without email confirmation', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({ id: 'u2', email: 'user@example.com' });
      const result = await adminModule.deleteUser(makeFormData({
        userId: 'u2',
        confirmEmail: 'wrong@example.com',
      }));
      expect(result.status).toBe('error');
    });

    it('deletes user with matching confirmation', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({ id: 'u2', email: 'user@example.com' });
      (prisma.role.findUnique as any).mockResolvedValue(null); // no admin role lookup needed
      (prisma.user.delete as any).mockResolvedValue({});
      const result = await adminModule.deleteUser(makeFormData({
        userId: 'u2',
        confirmEmail: 'user@example.com',
      }));
      expect(result.status).toBe('success');
    });

    it('returns error for missing userId', async () => {
      const result = await adminModule.deleteUser(makeFormData({ confirmEmail: 'x@y.com' }));
      expect(result.status).toBe('error');
    });
  });

  // ── updateUserRoles ────────────────────────────────────────────────────
  describe('updateUserRoles', () => {
    it('updates roles for a user', async () => {
      const origUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      (prisma.role.findMany as any).mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);
      (prisma.role.findUnique as any).mockResolvedValue({ id: 'r-admin', name: 'admin' });
      (prisma.userRole.findMany as any).mockResolvedValue([{ roleId: 'r1' }]);
      (prisma.$transaction as any).mockImplementation(async (fn: any) => {
        const tx = {
          $queryRaw: vi.fn(),
          userRole: { deleteMany: vi.fn(), createMany: vi.fn(), count: vi.fn().mockResolvedValue(2), findFirst: vi.fn().mockResolvedValue(null) },
          user: { update: vi.fn() },
        };
        return fn(tx);
      });

      const result = await adminModule.updateUserRoles(makeFormData({
        userId: 'u2',
        roleIds: ['r1', 'r2'],
      }));
      process.env.DATABASE_URL = origUrl;
      expect(result.status).toBe('success');
    });

    it('rejects invalid input (no userId)', async () => {
      const result = await adminModule.updateUserRoles(makeFormData({ roleIds: ['r1'] }));
      expect(result.status).toBe('error');
    });
  });
});
