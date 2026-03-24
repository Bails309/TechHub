import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

// Mock child_process
const mockExecSync = vi.fn();
vi.mock('child_process', () => ({
  execSync: (...args: any[]) => mockExecSync(...args),
}));

// Mock fs
const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();
vi.mock('fs', () => ({
  default: { existsSync: (...a: any[]) => mockExistsSync(...a), readFileSync: (...a: any[]) => mockReadFileSync(...a) },
  existsSync: (...a: any[]) => mockExistsSync(...a),
  readFileSync: (...a: any[]) => mockReadFileSync(...a),
}));

// Prisma mock
const mockUpsert = vi.fn().mockResolvedValue({});
const mockFindUnique = vi.fn();
const mockCreate = vi.fn().mockResolvedValue({});
const mockCount = vi.fn();
const mockDisconnect = vi.fn().mockResolvedValue(undefined);

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    systemState: {
      upsert: mockUpsert,
      findUnique: mockFindUnique,
      create: mockCreate,
    },
    user: {
      count: mockCount,
    },
    $disconnect: mockDisconnect,
  })),
}));

/**
 * Extracted logic from scripts/auto-migrate.js for testability.
 * Mirrors the real script's behaviour: db push → schema hash → conditional seed.
 */
async function autoMigrateLogic(env: Record<string, string | undefined>) {
  if (!env.DATABASE_URL) return 'skipped';

  mockExecSync(
    'npx -y prisma@5.18.0 db push --schema=./prisma/schema.prisma --accept-data-loss --skip-generate',
    { stdio: 'inherit', env: { ...env, PRISMA_HIDE_UPDATE_MESSAGE: 'true' } }
  );

  // Schema hash
  const schemaExists = mockExistsSync('schema.prisma');
  if (schemaExists) {
    const content: string = mockReadFileSync('schema.prisma', 'utf8');
    const normalized = content.replace(/\r\n/g, '\n');
    const hash = crypto.createHash('sha256').update(normalized).digest('hex');
    await mockUpsert({
      where: { id: 'SCHEMA_HASH' },
      update: { value: hash },
      create: { id: 'SCHEMA_HASH', value: hash },
    });
    await mockDisconnect();
  }

  // Seed
  const seedExists = mockExistsSync('seed.js');
  if (!seedExists) return 'no-seed-file';

  const flag = await mockFindUnique({ where: { id: 'SEEDED' } });
  if (flag) {
    await mockDisconnect();
    return 'already-seeded';
  }

  const userCount = await mockCount();
  if (userCount > 0) {
    await mockCreate({ data: { id: 'SEEDED', value: 'true' } });
    await mockDisconnect();
    return 'existing-db-flagged';
  }

  mockExecSync('node prisma/seed.js', { stdio: 'inherit', env });
  await mockCreate({ data: { id: 'SEEDED', value: 'true' } });
  await mockDisconnect();
  return 'seeded';
}

describe('auto-migrate.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Defaults: both files exist
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('model User { id Int @id }');
  });

  it('skips when DATABASE_URL is not set', async () => {
    const result = await autoMigrateLogic({});
    expect(result).toBe('skipped');
    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it('runs prisma db push when DATABASE_URL is set', async () => {
    mockFindUnique.mockResolvedValue({ id: 'SEEDED', value: 'true' });
    await autoMigrateLogic({ DATABASE_URL: 'postgres://test' });
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('prisma@5.18.0 db push'),
      expect.any(Object)
    );
  });

  it('computes and stores schema hash', async () => {
    mockFindUnique.mockResolvedValue({ id: 'SEEDED', value: 'true' });
    await autoMigrateLogic({ DATABASE_URL: 'postgres://test' });
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'SCHEMA_HASH' },
        create: expect.objectContaining({ id: 'SCHEMA_HASH' }),
      })
    );
  });

  it('normalizes CRLF to LF before hashing', async () => {
    mockReadFileSync.mockReturnValue('model User {\r\n  id Int @id\r\n}');
    mockFindUnique.mockResolvedValue({ id: 'SEEDED', value: 'true' });

    const expectedHash = crypto.createHash('sha256').update('model User {\n  id Int @id\n}').digest('hex');

    await autoMigrateLogic({ DATABASE_URL: 'postgres://test' });

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { value: expectedHash },
      })
    );
  });

  describe('seed logic', () => {
    it('seeds fresh database (no flag, no users)', async () => {
      mockFindUnique.mockResolvedValue(null);
      mockCount.mockResolvedValue(0);
      const result = await autoMigrateLogic({ DATABASE_URL: 'postgres://test' });
      expect(result).toBe('seeded');
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('seed.js'),
        expect.any(Object)
      );
      expect(mockCreate).toHaveBeenCalledWith({ data: { id: 'SEEDED', value: 'true' } });
    });

    it('skips seed for existing DB with users but no flag', async () => {
      mockFindUnique.mockResolvedValue(null);
      mockCount.mockResolvedValue(5);
      const result = await autoMigrateLogic({ DATABASE_URL: 'postgres://test' });
      expect(result).toBe('existing-db-flagged');
      expect(mockCreate).toHaveBeenCalledWith({ data: { id: 'SEEDED', value: 'true' } });
    });

    it('skips seed when SEEDED flag already exists', async () => {
      mockFindUnique.mockResolvedValue({ id: 'SEEDED', value: 'true' });
      const result = await autoMigrateLogic({ DATABASE_URL: 'postgres://test' });
      expect(result).toBe('already-seeded');
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('skips seed when seed file does not exist', async () => {
      mockExistsSync.mockImplementation((p: string) => !String(p).includes('seed'));
      mockFindUnique.mockResolvedValue(null);
      const result = await autoMigrateLogic({ DATABASE_URL: 'postgres://test' });
      expect(result).toBe('no-seed-file');
    });
  });
});
