import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../src/app/admin/actions';
import { validateCsrf } from '../src/lib/csrf';
import { getServerAuthSession } from '../src/lib/auth';
import { assertRateLimit } from '../src/lib/rateLimit';

// Mocks
vi.mock('../src/lib/csrf', () => ({
    validateCsrf: vi.fn()
}));

vi.mock('../src/lib/auth', () => ({
    getServerAuthSession: vi.fn()
}));

vi.mock('../src/lib/rateLimit', () => ({
    assertRateLimit: vi.fn()
}));

vi.mock('../src/lib/prisma', () => ({
    prisma: {
        appLink: {
            create: vi.fn().mockResolvedValue({ id: 'new-app-1' })
        },
        $transaction: vi.fn((cb) => cb({
            appLink: {
                create: vi.fn().mockResolvedValue({ id: 'new-app-1' })
            },
            userAppAccess: {
                createMany: vi.fn()
            }
        }))
    }
}));

vi.mock('../src/lib/audit', () => ({
    writeAuditLog: vi.fn()
}));

vi.mock('../src/lib/revalidate', () => ({
    safeRevalidatePath: vi.fn()
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn()
}));

describe('Admin Action Security Wiring', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (validateCsrf as any).mockResolvedValue(true);
        (getServerAuthSession as any).mockResolvedValue({
            user: { id: 'admin1', roles: ['admin'], authProvider: 'credentials' }
        });
    });

    const mockFormData = new FormData();
    mockFormData.set('name', 'Test App');
    mockFormData.set('url', 'http://t.com');
    mockFormData.set('audience', 'PUBLIC');

    it('rejects createApp if CSRF is invalid', async () => {
        (validateCsrf as any).mockResolvedValue(false);
        const result = await createApp(mockFormData);
        expect(result.status).toBe('error');
        expect(result.message).toContain('CSRF');
    });

    it('rejects createApp if user is not an admin', async () => {
        (getServerAuthSession as any).mockResolvedValue({
            user: { id: 'user1', roles: ['user'] }
        });
        const result = await createApp(mockFormData);
        expect(result.status).toBe('error');
        expect(result.message).toBe('Unauthorized');
    });

    it('enforces rate limiting on createApp', async () => {
        await createApp(mockFormData);
        expect(assertRateLimit).toHaveBeenCalledWith(expect.stringContaining('create-app:'));
    });

    it('succeeds if all security checks pass', async () => {
        const result = await createApp(mockFormData);
        expect(result.status).toBe('success');
    });
});
