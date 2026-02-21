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

  const body = await request.json();
  const payload = payloadSchema.parse(body);

  const validIds = await prisma.appLink.findMany({
    select: { id: true }
  });
  const validSet = new Set(validIds.map((item) => item.id));
  const filteredOrder = payload.order.filter((id) => validSet.has(id));

  await prisma.userAppOrder.upsert({
    where: { userId: session.user.id },
    update: { order: filteredOrder },
    create: { userId: session.user.id, order: filteredOrder }
  });

  return NextResponse.json({ ok: true });
}
