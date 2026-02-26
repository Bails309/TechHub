import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import path from 'path';
import { getServerAuthSession } from '@/lib/auth';
import { createAzureUploadSas } from '@/lib/storage';
import { validateCsrfToken } from '@/lib/csrf';

const MAX_ICON_BYTES = 2 * 1024 * 1024;
const ALLOWED_ICON_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);
const ALLOWED_ICON_MIME_TYPES = new Set(['image/png', 'image/jpeg']);

export async function POST(request: Request) {
  const session = await getServerAuthSession();
  if (!session?.user?.roles?.includes('admin')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Validate CSRF: compare header token against session-bound HMAC
  const csrfHeader = request.headers.get('x-csrf-token') ?? '';
  const sessionId = session.user.id ?? '';
  const csrfValid = validateCsrfToken(csrfHeader, sessionId);
  console.log('[CSRF-DEBUG] header:', csrfHeader.slice(0, 20) + '...', 'sessionId:', sessionId, 'valid:', csrfValid, 'secret-present:', !!process.env.NEXTAUTH_SECRET);
  if (!csrfHeader || !sessionId || !csrfValid) {
    return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
  }

  let payload: { filename?: string; contentType?: string; contentLength?: number } = {};
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const filename = String(payload.filename ?? 'upload.png');
  const contentType = String(payload.contentType ?? 'image/png');
  const contentLength = Number(payload.contentLength ?? 0);

  const extension = path.extname(filename).toLowerCase();
  if (!ALLOWED_ICON_EXTENSIONS.has(extension) || !ALLOWED_ICON_MIME_TYPES.has(contentType)) {
    return NextResponse.json({ error: 'Invalid file type' }, { status: 400 });
  }

  if (contentLength && contentLength > MAX_ICON_BYTES) {
    return NextResponse.json({ error: 'File too large' }, { status: 400 });
  }

  const blobName = `uploads/${randomUUID()}${extension}`;
  try {
    const sas = await createAzureUploadSas(blobName, contentType);
    return NextResponse.json({
      uploadUrl: sas.uploadUrl,
      blobUrl: sas.blobUrl,
      blobName,
      expiresAt: sas.expiresAt
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create SAS';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
