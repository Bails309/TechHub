import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getServerAuthSession } from '@/lib/auth';

const payloadSchema = z.object({
  order: z.array(z.string().min(1))
});

export async function POST(request: Request) {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

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
