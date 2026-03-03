import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('middleware idle timeout loop prevention (unit)', () => {
    beforeEach(() => {
        vi.resetModules();
        process.env.SESSION_IDLE_TIMEOUT_MS = '1000'; // 1 second
        process.env.NEXTAUTH_SECRET = 'test-secret';
        vi.doMock('next-auth/jwt', () => ({ getToken: vi.fn() }));
        vi.doMock('next/server', () => ({
            NextResponse: {
                next: vi.fn((opts: any) => ({
                    type: 'next',
                    headers: opts?.request?.headers,
                    cookies: {
                        set: vi.fn(),
                        delete: vi.fn()
                    }
                })),
                redirect: vi.fn((url: any) => ({
                    type: 'redirect',
                    location: url?.pathname ?? String(url),
                    cookies: {
                        set: vi.fn(),
                        delete: vi.fn()
                    }
                })),
                json: vi.fn(() => ({
                    type: 'json',
                    cookies: { delete: vi.fn() }
                }))
            }
        }));
        vi.doMock('../src/lib/auth-config', () => ({
            getSessionIdleTimeoutMs: () => Number(process.env.SESSION_IDLE_TIMEOUT_MS ?? 1200000)
        }));
    });

    it('clears cookies but skips redirect when idle timeout occurs on /auth/signin', async () => {
        const { getToken } = await import('next-auth/jwt');
        const { middleware } = await import('../src/middleware');

        (getToken as any).mockResolvedValue({ sub: 'u1' });

        // Last activity 2 seconds ago, timeout is 1 second
        const staleTime = Date.now() - 2000;
        const fakeReq: any = {
            method: 'GET',
            headers: new Headers([['accept', 'text/html']]),
            nextUrl: {
                pathname: '/auth/signin',
                protocol: 'http:',
                clone() { return { pathname: '/auth/signin' }; }
            },
            cookies: {
                get: (name: string) => {
                    if (name === 'techhub-activity') return { value: staleTime.toString() };
                    return undefined;
                }
            }
        };

        const res: any = await middleware(fakeReq as any);

        // Should NOT be a redirect if we are already at sign-in
        expect(res.type).not.toBe('redirect');

        // But MUST still clear the session cookies
        expect(res.cookies.delete).toHaveBeenCalledWith('next-auth.session-token');
        expect(res.cookies.delete).toHaveBeenCalledWith('techhub-activity');
    });
});
