import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../src/lib/prisma', () => ({
  prisma: {
    category: {
      create: vi.fn(),
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

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { prisma } from '../src/lib/prisma';
import { getServerAuthSession } from '../src/lib/auth';
import { validateCsrf } from '../src/lib/csrf';
import { createCategory, updateCategory, deleteCategory } from '../src/app/admin/category-mgmt/actions';

const mockSession = getServerAuthSession as ReturnType<typeof vi.fn>;
const mockCsrf = validateCsrf as ReturnType<typeof vi.fn>;
const mockCreate = prisma.category.create as ReturnType<typeof vi.fn>;
const mockUpdate = prisma.category.update as ReturnType<typeof vi.fn>;
const mockDelete = prisma.category.delete as ReturnType<typeof vi.fn>;

function makeFormData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return fd;
}

const adminSession = {
  user: { id: 'admin-1', roles: ['admin'], mustChangePassword: false, authProvider: 'credentials' },
};

describe('Category Management Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCsrf.mockResolvedValue(true);
    mockSession.mockResolvedValue(adminSession);
  });

  describe('createCategory', () => {
    it('creates a category successfully', async () => {
      mockCreate.mockResolvedValue({ id: 'cat-1', name: 'DevOps' });
      const fd = makeFormData({ name: 'DevOps', description: 'DevOps tools', order: '1' });

      const result = await createCategory(fd);

      expect(result).toEqual({ success: true });
      expect(mockCreate).toHaveBeenCalledOnce();
    });

    it('rejects when CSRF validation fails', async () => {
      mockCsrf.mockResolvedValue(false);
      const fd = makeFormData({ name: 'Test' });

      const result = await createCategory(fd);

      expect(result).toEqual({ success: false, error: 'Invalid CSRF token' });
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('rejects non-admin users', async () => {
      mockSession.mockResolvedValue({ user: { id: 'u1', roles: ['viewer'] } });
      const fd = makeFormData({ name: 'Test' });

      const result = await createCategory(fd);

      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('rejects when user must change password', async () => {
      mockSession.mockResolvedValue({
        user: { id: 'u1', roles: ['admin'], mustChangePassword: true, authProvider: 'credentials' },
      });
      const fd = makeFormData({ name: 'Test' });

      const result = await createCategory(fd);

      expect(result).toEqual({ success: false, error: 'Unauthorized: must_change_password' });
    });

    it('returns validation error for empty name', async () => {
      const fd = makeFormData({ name: '' });

      const result = await createCategory(fd);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('returns error when DB create fails (e.g. duplicate name)', async () => {
      mockCreate.mockRejectedValue(new Error('Unique constraint'));
      const fd = makeFormData({ name: 'Duplicate' });

      const result = await createCategory(fd);

      expect(result).toEqual({ success: false, error: 'Failed to create category. Use a unique name.' });
    });
  });

  describe('updateCategory', () => {
    it('updates a category successfully', async () => {
      mockUpdate.mockResolvedValue({ id: 'cat-1', name: 'Updated' });
      const fd = makeFormData({ name: 'Updated', order: '2' });

      const result = await updateCategory('cat-1', fd);

      expect(result).toEqual({ success: true });
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'cat-1' } })
      );
    });

    it('rejects when CSRF fails', async () => {
      mockCsrf.mockResolvedValue(false);
      const fd = makeFormData({ name: 'X' });

      const result = await updateCategory('cat-1', fd);

      expect(result).toEqual({ success: false, error: 'Invalid CSRF token' });
    });

    it('rejects non-admin users', async () => {
      mockSession.mockResolvedValue({ user: { id: 'u', roles: [] } });
      const fd = makeFormData({ name: 'X' });

      const result = await updateCategory('cat-1', fd);

      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns error when DB update fails', async () => {
      mockUpdate.mockRejectedValue(new Error('Not found'));
      const fd = makeFormData({ name: 'Valid' });

      const result = await updateCategory('cat-1', fd);

      expect(result).toEqual({ success: false, error: 'Failed to update category' });
    });
  });

  describe('deleteCategory', () => {
    it('deletes a category successfully', async () => {
      mockDelete.mockResolvedValue({ id: 'cat-1', name: 'Old' });
      const fd = makeFormData({ id: 'cat-1' });

      const result = await deleteCategory(fd);

      expect(result).toEqual({ success: true });
      expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'cat-1' } });
    });

    it('rejects when CSRF fails', async () => {
      mockCsrf.mockResolvedValue(false);
      const fd = makeFormData({ id: 'cat-1' });

      const result = await deleteCategory(fd);

      expect(result).toEqual({ success: false, error: 'Invalid CSRF token' });
    });

    it('returns error for missing id', async () => {
      const fd = makeFormData({});

      const result = await deleteCategory(fd);

      expect(result).toEqual({ success: false, error: 'Missing id' });
    });

    it('returns error when DB delete fails (linked apps)', async () => {
      mockDelete.mockRejectedValue(new Error('Foreign key'));
      const fd = makeFormData({ id: 'cat-linked' });

      const result = await deleteCategory(fd);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Ensure no apps are linked');
    });
  });
});
