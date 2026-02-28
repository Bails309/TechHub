import { NextResponse } from 'next/server';

import { getSystemHealth } from '@/lib/health';

export const dynamic = 'force-dynamic';

export async function GET() {
  const health = await getSystemHealth();
  const isHealthy = health.db.status === 'ok' && health.redis.status !== 'error';

  return NextResponse.json(health, {
    status: isHealthy ? 200 : 503
  });
}
