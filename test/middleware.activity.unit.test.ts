import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('middleware activity cookie handling (unit)', () => {
    beforeEach(() => {
        vi.resetModules();
        process.env.SESSION_IDLE_TIMEOUT_MS = '1000'; // 1 second
        process.env.NEXTAUTH_SECRET = 'test-secret';
        vi.doMock('next-auth/jwt', () => ({ getToken: vi.fn() }));
        vi.doMock('next/server', () => ({
            NextResponse: {
                next: vi.fn((opts: any) => ({
                    type: 'next',
                    headers: { append: vi.fn(), set: vi.fn(), get: vi.fn() }
                })),
                redirect: vi.fn((url: any) => ({
                    type: 'redirect',
                    location: url?.pathname ?? String(url),
                    headers: { append: vi.fn(), set: vi.fn(), get: vi.fn() }
                }))
            }
        }));
        vi.doMock('../src/lib/auth-config', () => ({
            getSessionIdleTimeoutMs: () => Number(process.env.SESSION_IDLE_TIMEOUT_MS ?? 1200000)
        }));
    });

    it('updates techhub-activity cookie on valid requests', async () => {
        const { getToken } = await import('next-auth/jwt');
        const { middleware } = await import('../src/middleware');

        (getToken as any).mockResolvedValue({ sub: 'u1' });

        const fakeReq: any = {
            method: 'GET',
            headers: new Headers([['accept', 'text/html']]),
            nextUrl: { pathname: '/any', protocol: 'http:', clone() { return { pathname: '/any' }; } },
            cookies: { get: () => undefined }
        };

        const res: any = await middleware(fakeReq as any);
        expect(res.headers.append).toHaveBeenCalledWith('Set-Cookie', expect.stringContaining('techhub-activity='));
    });

    it('redirects and clears cookies when idle timeout is exceeded', async () => {
        const { getToken } = await import('next-auth/jwt');
        const { middleware } = await import('../src/middleware');

        (getToken as any).mockResolvedValue({ sub: 'u1' });

        // Last activity 2 seconds ago, timeout is 1 second
        const staleTime = Date.now() - 2000;
        const fakeReq: any = {
            method: 'GET',
            headers: new Headers([['accept', 'text/html']]),
            nextUrl: { pathname: '/any', protocol: 'http:', clone() { return { pathname: '/any' }; } },
            cookies: {
                get: (name: string) => name === 'techhub-activity' ? { value: staleTime.toString() } : undefined
            }
        };

        // Need to handle potential clone() calls in middleware
        fakeReq.nextUrl.clone = () => ({ pathname: '/auth/signin' });

        const res: any = await middleware(fakeReq as any);
        expect(res.type).toBe('redirect');
        expect(res.location).toBe('/auth/signin');
        expect(res.headers.append).toHaveBeenCalledWith('Set-Cookie', expect.stringContaining('next-auth.session-token='));
        expect(res.headers.append).toHaveBeenCalledWith('Set-Cookie', expect.stringContaining('techhub-activity='));
    });
});
