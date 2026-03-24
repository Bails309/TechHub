import { NextResponse } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { getSessionEntries } from '@/lib/sessionTracker';

export const dynamic = 'force-dynamic';

/**
 * GET /api/sessions
 *
 * Admin-only diagnostic endpoint that returns the raw Redis sorted-set
 * entries for the current user's concurrent-session tracker.
 *
 * Response:  { userId, entries: [{ jti, score, expiresIn }] }
 *   - score: the heartbeat expiry timestamp (ms since epoch)
 *   - expiresIn: ms until the entry expires (negative = already stale)
 */
export async function GET() {
  const session = await getServerAuthSession();
  if (!session?.user?.roles?.includes('admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const userId = session.user.id;
  const entries = await getSessionEntries(userId);

  return NextResponse.json({
    userId,
    now: Date.now(),
    count: entries.length,
    entries,
  });
}
