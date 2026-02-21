import { NextResponse } from 'next/server';
import path from 'path';
import { readFile } from 'fs/promises';

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg'
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path: segments = [] } = await context.params;
  const filename = segments.join('/');
  const baseDir = path.join(process.cwd(), 'uploads');
  const resolved = path.resolve(baseDir, filename);
  const relative = path.relative(baseDir, resolved);

  if (!filename || relative.startsWith('..') || path.isAbsolute(relative)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const data = await readFile(resolved);
    const extension = path.extname(resolved).toLowerCase();
    const contentType = MIME_TYPES[extension];
    if (!contentType) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff'
    };

    return new NextResponse(data, {
      status: 200,
      headers
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
