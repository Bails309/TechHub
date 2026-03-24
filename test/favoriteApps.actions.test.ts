import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../src/lib/prisma', () => ({
  prisma: {
    userFavoriteApp: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../src/lib/auth', () => ({
  getServerAuthSession: vi.fn(),
}));

vi.mock('../src/lib/csrf', () => ({
  validateCsrf: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { prisma } from '../src/lib/prisma';
import { getServerAuthSession } from '../src/lib/auth';
import { validateCsrf } from '../src/lib/csrf';
import { toggleFavoriteApp } from '../src/app/actions/favoriteApps';
import { getFavoriteApps } from '../src/app/actions/getFavoriteApps';

const mockSession = getServerAuthSession as ReturnType<typeof vi.fn>;
const mockCsrf = validateCsrf as ReturnType<typeof vi.fn>;
const mockFindUnique = prisma.userFavoriteApp.findUnique as ReturnType<typeof vi.fn>;
const mockCreate = prisma.userFavoriteApp.create as ReturnType<typeof vi.fn>;
const mockDeleteFav = prisma.userFavoriteApp.delete as ReturnType<typeof vi.fn>;
const mockFindMany = prisma.userFavoriteApp.findMany as ReturnType<typeof vi.fn>;

function makeFormData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return fd;
}

describe('Favorite Apps Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCsrf.mockResolvedValue(true);
    mockSession.mockResolvedValue({ user: { id: 'user-1', roles: ['viewer'] } });
  });

  describe('toggleFavoriteApp', () => {
    it('adds app to favorites when not yet favorited', async () => {
      mockFindUnique.mockResolvedValue(null);
      mockCreate.mockResolvedValue({});
      const fd = makeFormData({ appId: 'app-1' });

      const result = await toggleFavoriteApp(fd);

      expect(result).toEqual({ success: true, isFavorited: true });
      expect(mockCreate).toHaveBeenCalledOnce();
      expect(mockDeleteFav).not.toHaveBeenCalled();
    });

    it('removes app from favorites when already favorited', async () => {
      mockFindUnique.mockResolvedValue({ userId: 'user-1', appId: 'app-1' });
      mockDeleteFav.mockResolvedValue({});
      const fd = makeFormData({ appId: 'app-1' });

      const result = await toggleFavoriteApp(fd);

      expect(result).toEqual({ success: true, isFavorited: false });
      expect(mockDeleteFav).toHaveBeenCalledOnce();
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('rejects when CSRF validation fails', async () => {
      mockCsrf.mockResolvedValue(false);
      const fd = makeFormData({ appId: 'app-1' });

      const result = await toggleFavoriteApp(fd);

      expect(result).toEqual({ success: false, error: 'Invalid CSRF token' });
    });

    it('rejects when not signed in', async () => {
      mockSession.mockResolvedValue(null);
      const fd = makeFormData({ appId: 'app-1' });

      const result = await toggleFavoriteApp(fd);

      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns error for missing appId', async () => {
      const fd = makeFormData({});

      const result = await toggleFavoriteApp(fd);

      expect(result).toEqual({ success: false, error: 'Missing app id' });
    });

    it('returns error when DB operation fails', async () => {
      mockFindUnique.mockRejectedValue(new Error('DB error'));
      const fd = makeFormData({ appId: 'app-1' });

      const result = await toggleFavoriteApp(fd);

      expect(result).toEqual({ success: false, error: 'Failed to update preferences.' });
    });
  });

  describe('getFavoriteApps', () => {
    it('returns list of favorite app IDs', async () => {
      mockFindMany.mockResolvedValue([{ appId: 'app-1' }, { appId: 'app-2' }]);

      const result = await getFavoriteApps();

      expect(result).toEqual(['app-1', 'app-2']);
    });

    it('returns empty array when not signed in', async () => {
      mockSession.mockResolvedValue(null);

      const result = await getFavoriteApps();

      expect(result).toEqual([]);
    });

    it('returns empty array when DB throws', async () => {
      mockFindMany.mockRejectedValue(new Error('DB error'));

      const result = await getFavoriteApps();

      expect(result).toEqual([]);
    });
  });
});
