import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma before importing the module under test
vi.mock('../src/lib/prisma', () => ({
  prisma: {
    passwordPolicy: {
      findFirst: vi.fn(),
    },
  },
}));

import { prisma } from '../src/lib/prisma';
import { getPasswordPolicy } from '../src/lib/passwordPolicy';
import { defaultPasswordPolicy } from '../src/lib/password';

const mockFindFirst = prisma.passwordPolicy.findFirst as ReturnType<typeof vi.fn>;

describe('getPasswordPolicy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns DB policy when a record exists', async () => {
    const dbPolicy = {
      minLength: 16,
      requireUpper: false,
      requireLower: true,
      requireNumber: true,
      requireSymbol: false,
      historyCount: 3,
    };
    mockFindFirst.mockResolvedValue(dbPolicy);

    const result = await getPasswordPolicy();

    expect(result).toEqual(dbPolicy);
    expect(mockFindFirst).toHaveBeenCalledOnce();
  });

  it('returns defaultPasswordPolicy when DB returns null', async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await getPasswordPolicy();

    expect(result).toEqual(defaultPasswordPolicy);
  });

  it('returns defaultPasswordPolicy when DB throws', async () => {
    mockFindFirst.mockRejectedValue(new Error('connection refused'));

    const result = await getPasswordPolicy();

    expect(result).toEqual(defaultPasswordPolicy);
  });

  it('maps only the expected fields from the DB record', async () => {
    // Simulate a Prisma record that has extra DB-level columns
    mockFindFirst.mockResolvedValue({
      id: 'policy-1',
      minLength: 10,
      requireUpper: true,
      requireLower: false,
      requireNumber: false,
      requireSymbol: true,
      historyCount: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await getPasswordPolicy();

    expect(result).toEqual({
      minLength: 10,
      requireUpper: true,
      requireLower: false,
      requireNumber: false,
      requireSymbol: true,
      historyCount: 2,
    });
    // Should not leak extra DB fields
    expect(result).not.toHaveProperty('id');
    expect(result).not.toHaveProperty('createdAt');
  });
});
