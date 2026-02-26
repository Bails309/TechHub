import { describe, it, expect, vi, beforeEach } from 'vitest';
import { forcePasswordReset, type ForcePasswordResetState } from '../src/app/admin/actions';
import { prisma } from '../src/lib/prisma';
import { getServerAuthSession } from '../src/lib/auth';
import { validateCsrf } from '../src/lib/csrf';

// Mocks
vi.mock('../src/lib/prisma', () => ({
    prisma: {
        user: {
            findUnique: vi.fn(),
            update: vi.fn()
        },
        passwordHistory: {
            create: vi.fn()
        },
        $transaction: vi.fn((callback) => callback(prisma))
    }
}));

vi.mock('../src/lib/auth', () => ({
    getServerAuthSession: vi.fn()
}));

vi.mock('../src/lib/csrf', () => ({
    validateCsrf: vi.fn()
}));

vi.mock('../src/lib/password', () => ({
    hashPassword: vi.fn().mockResolvedValue('hashed_password')
}));

vi.mock('../src/lib/audit', () => ({
    writeAuditLog: vi.fn()
}));

vi.mock('../src/lib/redis', () => ({
    invalidateUserMeta: vi.fn()
}));

vi.mock('../src/lib/revalidate', () => ({
    safeRevalidatePath: vi.fn()
}));

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
        expect(typeof result.generatedPassword).toBe('string');
        expect(result.generatedPassword?.length).toBeGreaterThan(10); // base64 of 12 bytes is 16 chars

        expect(prisma.user.update).toHaveBeenCalledWith({
            where: { id: 'target1' },
            data: {
                passwordHash: 'hashed_password',
                mustChangePassword: true
            }
        });

        expect(prisma.passwordHistory.create).toHaveBeenCalledWith({
            data: { userId: 'target1', hash: 'hashed_password' }
        });
    });
});
