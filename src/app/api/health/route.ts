import { NextResponse } from 'next/server';

import { getSystemHealth } from '@/lib/health';
import { getServerAuthSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerAuthSession();
  if (!session?.user?.roles?.includes('admin')) {
    return NextResponse.json({ status: 'ok' }, { status: 200 });
  }

  const health = await getSystemHealth();
  const isHealthy = health.db.status === 'ok' && health.redis.status !== 'error';

  return NextResponse.json(health, {
    status: isHealthy ? 200 : 503
  });
}
