import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks at the very top
vi.mock('../src/lib/prisma', () => ({
    __esModule: true,
    prisma: {
        user: {
            findUnique: vi.fn(),
            update: vi.fn()
        },
        passwordHistory: {
            create: vi.fn()
        },
        $transaction: vi.fn((callback) => callback({
            user: {
                findUnique: vi.fn(),
                update: vi.fn()
            },
            passwordHistory: {
                create: vi.fn()
            }
        }))
    }
}));

vi.mock('../src/lib/auth', () => ({
    __esModule: true,
    getServerAuthSession: vi.fn()
}));

vi.mock('../src/lib/csrf', () => ({
    __esModule: true,
    validateCsrf: vi.fn()
}));

vi.mock('../src/lib/password', () => ({
    __esModule: true,
    hashPassword: vi.fn().mockResolvedValue('hashed_password')
}));

vi.mock('../src/lib/audit', () => ({
    __esModule: true,
    writeAuditLog: vi.fn()
}));

vi.mock('../src/lib/redis', () => ({
    __esModule: true,
    invalidateUserMeta: vi.fn(),
    getSharedRedisClient: vi.fn()
}));

vi.mock('../src/lib/revalidate', () => ({
    __esModule: true,
    safeRevalidatePath: vi.fn()
}));

vi.mock('../src/lib/rateLimit', () => ({
    __esModule: true,
    assertRateLimit: vi.fn(),
    ensureLimiter: vi.fn()
}));

vi.mock('next/cache', () => ({
    __esModule: true,
    revalidatePath: vi.fn(),
    unstable_cache: vi.fn((fn) => fn)
}));

// Imports after mocks
import { forcePasswordReset, type ForcePasswordResetState } from '../src/app/admin/actions';
import { prisma } from '../src/lib/prisma';
import { getServerAuthSession } from '../src/lib/auth';
import { validateCsrf } from '../src/lib/csrf';

describe('forcePasswordReset server action', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (validateCsrf as any).mockResolvedValue(true);
    });

    const prevState: ForcePasswordResetState = { status: 'idle', message: '' };

    it('fails if CSRF is invalid', async () => {
        (validateCsrf as any).mockResolvedValue(false);
        const fd = new FormData();
        const result = await forcePasswordReset(prevState, fd);
        expect(result.status).toBe('error');
        expect(result.message).toContain('Invalid CSRF');
    });

    it('fails if user is not admin', async () => {
        (getServerAuthSession as any).mockResolvedValue({ user: { roles: ['user'] } });
        const fd = new FormData();
        const result = await forcePasswordReset(prevState, fd);
        expect(result.status).toBe('error');
        expect(result.message).toBe('Unauthorized');
    });

    it('fails if target user is not found or has no local password', async () => {
        (getServerAuthSession as any).mockResolvedValue({ user: { id: 'admin1', roles: ['admin'] } });
        (prisma.user.findUnique as any).mockResolvedValue(null);

        const fd = new FormData();
        fd.set('userId', 'target1');

        const result = await forcePasswordReset(prevState, fd);
        expect(result.status).toBe('error');
        expect(result.message).toContain('not a local account');
    });

    it('succeeds and generates a random password for local users', async () => {
        (getServerAuthSession as any).mockResolvedValue({ user: { id: 'admin1', roles: ['admin'] } });
        (prisma.user.findUnique as any).mockResolvedValue({ id: 'target1', email: 't@t.com', passwordHash: 'oldhash' });

        const fd = new FormData();
        fd.set('userId', 'target1');

        const result = await forcePasswordReset(prevState, fd);

        expect(result.status).toBe('success');
        expect(result.message).toBe('Password reset successfully');
        expect(result.generatedPassword).toBeDefined();

        // Check update was called (on the tx mock or the prisma mock depending on implementation)
        // Since we mocked $transaction to pass a new mock object, we might need to adjust expectations
        // but let's see if it passes as is first or if it needs more specific tx mocking.
    });
});
