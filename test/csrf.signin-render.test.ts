import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockJar = {
  get: vi.fn(),
  set: vi.fn(),
};

const mockCookies = vi.fn(async () => mockJar);
const mockHeaders = vi.fn(async () => new Headers());
const mockGetToken = vi.fn();

vi.mock('next/headers', () => ({
  cookies: () => mockCookies(),
  headers: () => mockHeaders(),
}));

vi.mock('next-auth/jwt', () => ({
  getToken: (opts: unknown) => mockGetToken(opts),
}));

describe('getServerCsrfToken signed-out signin render regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-for-signin-render');
    mockGetToken.mockResolvedValue(null);
    mockJar.get.mockImplementation(() => undefined);
  });

  it('does not set cookies when rendering signed-out pages with setIfMissing=false', async () => {
    const { getServerCsrfToken } = await import('../src/lib/csrf');

    const token = await getServerCsrfToken({ setIfMissing: false });

    expect(token).toBe('');
    expect(mockJar.set).not.toHaveBeenCalled();
    expect(mockJar.get).toHaveBeenCalledWith('visitor-id');
  });
});