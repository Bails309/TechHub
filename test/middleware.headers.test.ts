import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => ({
    NextResponse: {
        next: vi.fn(() => ({ headers: { set: vi.fn() } })),
        redirect: vi.fn(() => ({ headers: { set: vi.fn() } })),
    },
    NextRequest: vi.fn()
}));

vi.mock('next-auth/jwt', () => ({ getToken: vi.fn() }));

describe('Middleware Headers', () => {
    it('applies HSTS in production', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('PLAYWRIGHT_TESTING', 'false');
        const { middleware } = await import('../src/middleware');
        const { NextResponse } = await import('next/server');
        const req: any = {
            method: 'GET',
            headers: new Headers([['accept', 'text/html']]),
            nextUrl: { pathname: '/', protocol: 'https:', clone() { return { ...this }; } },
            cookies: { get: () => undefined }
        };
        const res: any = await middleware(req);
        expect(res.headers.set).toHaveBeenCalledWith('Strict-Transport-Security', expect.stringContaining('max-age'));
    });
});
