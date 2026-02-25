import { cookies } from 'next/headers';

async function readCookieValue(name: string): Promise<string | null> {
  try {
    const jar = await cookies();
    return jar?.get ? jar.get(name)?.value ?? null : null;
  } catch {
    return null;
  }
}

export async function validateCsrf(formData: FormData): Promise<boolean> {
  const token = String(formData.get('csrfToken') ?? '');
  if (!token) return false;
  const cookie = await readCookieValue('XSRF-TOKEN');
  if (!cookie) return false;
  return cookie === token;
}

export async function getCsrfFromRequest(): Promise<string | null> {
  return await readCookieValue('XSRF-TOKEN');
}
