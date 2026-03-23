import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────
vi.mock('../src/lib/prisma', () => ({
  prisma: {
    personalApp: {
      count: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock('../src/lib/auth', () => ({
  getServerAuthSession: vi.fn(),
}));

vi.mock('../src/lib/csrf', () => ({
  validateCsrf: vi.fn(),
}));

vi.mock('../src/lib/audit', () => ({
  writeAuditLog: vi.fn(),
}));

vi.mock('../src/lib/storage', () => ({
  saveIcon: vi.fn().mockResolvedValue('/uploads/icon.png'),
  deleteIcon: vi.fn(),
}));

vi.mock('../src/lib/rateLimit', () => ({
  assertRateLimit: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { prisma } from '../src/lib/prisma';
import { getServerAuthSession } from '../src/lib/auth';
import { validateCsrf } from '../src/lib/csrf';
import { createPersonalApp, updatePersonalApp, deletePersonalApp } from '../src/app/profile/personalAppActions';

const mockSession = getServerAuthSession as ReturnType<typeof vi.fn>;
const mockCsrf = validateCsrf as ReturnType<typeof vi.fn>;

function makeFormData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return fd;
}

const userSession = { user: { id: 'user-1', roles: ['viewer'] } };

describe('Personal App Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCsrf.mockResolvedValue(true);
    mockSession.mockResolvedValue(userSession);
  });

  // ── createPersonalApp ──────────────────────────────────────────────
  describe('createPersonalApp', () => {
    it('creates a personal app', async () => {
      (prisma.personalApp.count as any).mockResolvedValue(0);
      (prisma.personalApp.create as any).mockResolvedValue({ id: 'pa-1', name: 'MyApp' });

      const result = await createPersonalApp(null, makeFormData({
        name: 'MyApp',
        url: 'https://example.com',
        description: 'Test app',
      }));
      expect(result.status).toBe('success');
    });

    it('rejects CSRF failure', async () => {
      mockCsrf.mockResolvedValue(false);
      const result = await createPersonalApp(null, makeFormData({ name: 'X', url: 'https://x.com' }));
      expect(result.status).toBe('error');
      expect(result.message).toContain('CSRF');
    });

    it('rejects unauthenticated user', async () => {
      mockSession.mockResolvedValue(null);
      const result = await createPersonalApp(null, makeFormData({ name: 'X', url: 'https://x.com' }));
      expect(result.status).toBe('error');
      expect(result.message).toContain('signed in');
    });

    it('rejects empty name', async () => {
      const result = await createPersonalApp(null, makeFormData({ name: '', url: 'https://x.com' }));
      expect(result.status).toBe('error');
      expect(result.message).toContain('Name');
    });

    it('rejects javascript: URL scheme', async () => {
      const result = await createPersonalApp(null, makeFormData({
        name: 'Evil',
        url: 'javascript:alert(1)',
      }));
      expect(result.status).toBe('error');
      expect(result.message).toContain('http');
    });

    it('rejects data: URL scheme', async () => {
      const result = await createPersonalApp(null, makeFormData({
        name: 'Evil',
        url: 'data:text/html,<script>alert(1)</script>',
      }));
      expect(result.status).toBe('error');
      expect(result.message).toContain('http');
    });

    it('enforces per-user limit', async () => {
      (prisma.personalApp.count as any).mockResolvedValue(25);
      const result = await createPersonalApp(null, makeFormData({
        name: 'Overflow',
        url: 'https://example.com',
      }));
      expect(result.status).toBe('error');
      expect(result.message).toContain('25');
    });

    it('rejects overly long description', async () => {
      const result = await createPersonalApp(null, makeFormData({
        name: 'App',
        url: 'https://example.com',
        description: 'x'.repeat(501),
      }));
      expect(result.status).toBe('error');
      expect(result.message).toContain('Description');
    });
  });

  // ── updatePersonalApp ──────────────────────────────────────────────
  describe('updatePersonalApp', () => {
    it('updates an owned app', async () => {
      (prisma.personalApp.findUnique as any).mockResolvedValue({ id: 'pa-1', userId: 'user-1', icon: null });
      (prisma.personalApp.update as any).mockResolvedValue({});

      const result = await updatePersonalApp(null, makeFormData({
        appId: 'pa-1',
        name: 'Updated',
        url: 'https://updated.com',
        description: '',
      }));
      expect(result.status).toBe('success');
    });

    it('rejects update for non-owned app', async () => {
      (prisma.personalApp.findUnique as any).mockResolvedValue({ id: 'pa-1', userId: 'other-user' });

      const result = await updatePersonalApp(null, makeFormData({
        appId: 'pa-1',
        name: 'Hack',
        url: 'https://hack.com',
      }));
      expect(result.status).toBe('error');
      expect(result.message).toContain('not found');
    });

    it('rejects missing appId', async () => {
      const result = await updatePersonalApp(null, makeFormData({ name: 'X', url: 'https://x.com' }));
      expect(result.status).toBe('error');
    });

    it('rejects javascript: URL in update', async () => {
      (prisma.personalApp.findUnique as any).mockResolvedValue({ id: 'pa-1', userId: 'user-1', icon: null });
      const result = await updatePersonalApp(null, makeFormData({
        appId: 'pa-1',
        name: 'Evil',
        url: 'javascript:alert(1)',
      }));
      expect(result.status).toBe('error');
      expect(result.message).toContain('http');
    });
  });

  // ── deletePersonalApp ──────────────────────────────────────────────
  describe('deletePersonalApp', () => {
    it('deletes an owned app', async () => {
      (prisma.personalApp.findUnique as any).mockResolvedValue({ id: 'pa-1', userId: 'user-1', icon: null });
      (prisma.personalApp.delete as any).mockResolvedValue({});

      const result = await deletePersonalApp(null, makeFormData({ appId: 'pa-1' }));
      expect(result.status).toBe('success');
    });

    it('rejects delete for non-owned app', async () => {
      (prisma.personalApp.findUnique as any).mockResolvedValue({ id: 'pa-1', userId: 'other-user' });

      const result = await deletePersonalApp(null, makeFormData({ appId: 'pa-1' }));
      expect(result.status).toBe('error');
      expect(result.message).toContain('not found');
    });

    it('rejects missing appId', async () => {
      const result = await deletePersonalApp(null, makeFormData({}));
      expect(result.status).toBe('error');
    });

    it('rejects CSRF failure', async () => {
      mockCsrf.mockResolvedValue(false);
      const result = await deletePersonalApp(null, makeFormData({ appId: 'pa-1' }));
      expect(result.status).toBe('error');
      expect(result.message).toContain('CSRF');
    });
  });
});
