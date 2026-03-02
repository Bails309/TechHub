import { NextResponse } from 'next/server';
import { readIcon } from '@/lib/storage';

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path: segments = [] } = await context.params;

  if (segments.some(seg => seg === '..' || seg === '.' || seg.includes('/'))) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  const filename = segments.join('/');

  if (!filename) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const iconData = await readIcon(`uploads/${filename}`);

  if (!iconData) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const headers: Record<string, string> = {
    'Content-Type': iconData.contentType,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff'
  };

  return new NextResponse(Buffer.from(iconData.buffer), {
    status: 200,
    headers
  });
}
