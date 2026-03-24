import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────
vi.mock('../src/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../src/lib/auth', () => ({
  getServerAuthSession: vi.fn(),
}));

vi.mock('../src/lib/csrf', () => ({
  validateCsrf: vi.fn(),
}));

vi.mock('../src/lib/userCache', () => ({
  invalidateUserMeta: vi.fn(),
}));

vi.mock('../src/lib/audit', () => ({
  writeAuditLog: vi.fn(),
}));

vi.mock('../src/lib/storage', () => ({
  saveIcon: vi.fn().mockResolvedValue('/uploads/new-avatar.png'),
  deleteIcon: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { prisma } from '../src/lib/prisma';
import { getServerAuthSession } from '../src/lib/auth';
import { validateCsrf } from '../src/lib/csrf';
import { saveIcon, deleteIcon } from '../src/lib/storage';
import { updateProfileImage } from '../src/app/profile/actions';

const mockSession = getServerAuthSession as ReturnType<typeof vi.fn>;
const mockCsrf = validateCsrf as ReturnType<typeof vi.fn>;

function makeFormDataWithFile(): FormData {
  const fd = new FormData();
  const file = new File(['image-data'], 'avatar.png', { type: 'image/png' });
  fd.append('image', file);
  return fd;
}

describe('updateProfileImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCsrf.mockResolvedValue(true);
    mockSession.mockResolvedValue({ user: { id: 'u1' } });
    (prisma.user.findUnique as any).mockResolvedValue({ image: '/uploads/old.png' });
    (prisma.user.update as any).mockResolvedValue({});
  });

  it('uploads a new profile image', async () => {
    const result = await updateProfileImage(makeFormDataWithFile());
    expect(result.status).toBe('success');
    expect(result.image).toBe('/uploads/new-avatar.png');
    expect(saveIcon).toHaveBeenCalled();
    expect(deleteIcon).toHaveBeenCalledWith('/uploads/old.png');
  });

  it('rejects CSRF failure', async () => {
    mockCsrf.mockResolvedValue(false);
    const result = await updateProfileImage(makeFormDataWithFile());
    expect(result.status).toBe('error');
    expect(result.message).toContain('CSRF');
  });

  it('rejects unauthenticated user', async () => {
    mockSession.mockResolvedValue(null);
    const result = await updateProfileImage(makeFormDataWithFile());
    expect(result.status).toBe('error');
    expect(result.message).toContain('Not signed in');
  });

  it('rejects empty image', async () => {
    const fd = new FormData();
    const result = await updateProfileImage(fd);
    expect(result.status).toBe('error');
    expect(result.message).toContain('No image');
  });

  it('returns error on DB failure', async () => {
    (prisma.user.update as any).mockRejectedValue(new Error('DB down'));
    const result = await updateProfileImage(makeFormDataWithFile());
    expect(result.status).toBe('error');
    expect(result.message).toContain('DB down');
  });

  it('skips delete when user had no previous image', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ image: null });
    const result = await updateProfileImage(makeFormDataWithFile());
    expect(result.status).toBe('success');
    expect(deleteIcon).not.toHaveBeenCalled();
  });
});
