import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => {
    const MockNextResponse: any = vi.fn().mockImplementation((body, init) => ({
        body,
        status: init?.status ?? 200,
        headers: { set: vi.fn(), get: vi.fn(), append: vi.fn() }
    }));
    MockNextResponse.redirect = vi.fn().mockImplementation((url) => ({
        status: 307,
        location: String(url),
        headers: { set: vi.fn(), get: vi.fn(), append: vi.fn() }
    }));
    MockNextResponse.json = vi.fn().mockImplementation((body, init) => ({
        body,
        status: init?.status ?? 200,
        headers: { set: vi.fn(), get: vi.fn(), append: vi.fn() }
    }));
    return { NextResponse: MockNextResponse, NextRequest: vi.fn() };
});

vi.mock('@/lib/auth', () => ({ getServerAuthSession: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { appLink: { findUnique: vi.fn() } } }));
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn() }));

describe('Launch API Authorization', () => {
    const createRequest = () => ({
        headers: new Headers(),
        nextUrl: { origin: 'http://localhost' }
    });
    const createContext = (appId: string) => ({ params: Promise.resolve({ appId }) });

    it('allows PUBLIC apps to anyone', async () => {
        const { prisma } = await import('@/lib/prisma');
        const { GET } = await import('../src/app/api/launch/[appId]/route');
        (prisma.appLink.findUnique as any).mockResolvedValue({
            id: 'app1', audience: 'PUBLIC', url: 'http://e.com'
        });
        const res: any = await GET(createRequest() as any, createContext('app1'));
        expect(res.status).toBe(307);
    });

    it('returns 404 for unauthorized access (Defense in Depth)', async () => {
        const { prisma } = await import('@/lib/prisma');
        const { getServerAuthSession } = await import('@/lib/auth');
        const { GET } = await import('../src/app/api/launch/[appId]/route');
        (prisma.appLink.findUnique as any).mockResolvedValue({
            id: 'app1', audience: 'AUTHENTICATED'
        });
        (getServerAuthSession as any).mockResolvedValue(null);
        const res: any = await GET(createRequest() as any, createContext('app1'));
        expect(res.status).toBe(404);
    });
});
