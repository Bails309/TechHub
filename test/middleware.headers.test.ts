import { describe, it, expect, vi, beforeEach } from 'vitest';

const { MockNextResponse } = vi.hoisted(() => {
    const nextFn = vi.fn().mockImplementation(() => ({
        status: 200,
        headers: { set: vi.fn(), get: vi.fn(), append: vi.fn(), has: vi.fn() }
    }));
    const redirectFn = vi.fn().mockImplementation((url) => ({
        type: 'redirect',
        location: String(url),
        status: 307,
        headers: { set: vi.fn(), get: vi.fn(), append: vi.fn(), has: vi.fn() }
    }));

    const Mock: any = vi.fn().mockImplementation((body, init) => ({
        body,
        status: init?.status ?? 200,
        headers: { set: vi.fn(), get: vi.fn(), append: vi.fn(), has: vi.fn() }
    }));
    Mock.next = nextFn;
    Mock.redirect = redirectFn;

    return { MockNextResponse: Mock };
});

vi.mock('next/server', () => ({
    NextResponse: MockNextResponse,
    NextRequest: vi.fn(),
    __esModule: true
}));

vi.mock('next-auth/jwt', () => ({
    getToken: vi.fn(() => Promise.resolve({ sub: 'user1' })),
    __esModule: true
}));

describe('Middleware Headers', () => {
    it('applies HSTS in production', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('PLAYWRIGHT_TESTING', 'false');
        vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-must-be-32-chars-long-12345');

        const { middleware } = await import('../src/middleware');
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
