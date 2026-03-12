import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import { getServerAuthSession } from '../../../lib/auth';
import { validateApiCsrf } from '../../../lib/csrf';
import { assertRateLimit } from '../../../lib/rateLimit';

const payloadSchema = z.object({
  order: z.array(z.string().min(1))
});

export async function POST(request: Request) {
  // Validate CSRF for mutating API request
  // `validateApiCsrf` expects a NextRequest; coerce when possible.
  try {
    // `request` in app routes is typically a NextRequest-compatible object
    // so cast to any to call the helper which uses NextRequest APIs.
    // If validation fails, reject the request.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const ok = await validateApiCsrf(request as any);
    if (!ok) return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
  } catch {
    return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
  }
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  await assertRateLimit(`app-order:${session.user.id}`);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const payload = payloadSchema.safeParse(body);
  if (!payload.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const validIds = await prisma.appLink.findMany({
    select: { id: true }
  });
  const validSet = new Set(validIds.map((item) => item.id));
  const filteredOrder = payload.data.order.filter((id) => validSet.has(id));

  await prisma.userAppOrder.upsert({
    where: { userId: session.user.id },
    update: { order: filteredOrder },
    create: { userId: session.user.id, order: filteredOrder }
  });

  return NextResponse.json({ ok: true });
}
