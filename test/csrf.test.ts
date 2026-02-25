import { describe, it, expect, vi } from 'vitest';

let cookieValue: string | null = null;

vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => (name === 'XSRF-TOKEN' && cookieValue ? { value: cookieValue } : undefined)
  })
}));

describe('validateCsrf', () => {
  it('returns true when token matches cookie', async () => {
    cookieValue = 'token-123';
    const { validateCsrf } = await import('../src/lib/csrf');
    const formData = { get: (k: string) => (k === 'csrfToken' ? 'token-123' : '') } as unknown as FormData;

    await expect(validateCsrf(formData)).resolves.toBe(true);
  });

  it('returns false when token is missing or mismatched', async () => {
    cookieValue = 'token-123';
    const { validateCsrf } = await import('../src/lib/csrf');

    const missingToken = { get: (_k: string) => '' } as unknown as FormData;
    await expect(validateCsrf(missingToken)).resolves.toBe(false);

    const badToken = { get: (k: string) => (k === 'csrfToken' ? 'nope' : '') } as unknown as FormData;
    await expect(validateCsrf(badToken)).resolves.toBe(false);
  });
});
