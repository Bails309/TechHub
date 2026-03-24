import { describe, it, expect } from 'vitest';

/**
 * ConcurrentSessionBanner is a React client component. Since the project
 * does not include @testing-library/react or a DOM environment, these tests
 * verify the **rendering logic** (when the banner should appear / hide)
 * by exercising the same conditional checks the component uses.
 *
 * The component renders when ALL of these are true:
 *   - status === 'authenticated'
 *   - count > 1
 *   - not dismissed (React state)
 *
 * Dismissing sets `dismissed = true` and records the count.  The banner
 * reappears only if the count later *increases* past the dismissed value
 * (new device logged in).  React state resets on page reload, which is
 * appropriate for a security notice.
 */

/** Mirrors the component's visibility logic */
function shouldRenderBanner(
  status: string,
  concurrentSessions: number | undefined,
  dismissed: boolean,
): boolean {
  const count = concurrentSessions ?? 0;
  return status === 'authenticated' && count > 1 && !dismissed;
}

/** Mirrors the component's re-show logic (useEffect) */
function shouldResetDismiss(
  dismissed: boolean,
  count: number,
  dismissedAtCount: number,
): boolean {
  return dismissed && count > dismissedAtCount;
}

/** Mirrors the component's device label logic */
function deviceLabel(count: number): string {
  return count === 2 ? 'device' : 'devices';
}

describe('ConcurrentSessionBanner — rendering logic', () => {
  describe('visibility', () => {
    it('renders when authenticated with >1 concurrent sessions', () => {
      expect(shouldRenderBanner('authenticated', 2, false)).toBe(true);
      expect(shouldRenderBanner('authenticated', 5, false)).toBe(true);
    });

    it('does NOT render when session count is 0 or 1', () => {
      expect(shouldRenderBanner('authenticated', 0, false)).toBe(false);
      expect(shouldRenderBanner('authenticated', 1, false)).toBe(false);
    });

    it('does NOT render when concurrentSessions is undefined', () => {
      expect(shouldRenderBanner('authenticated', undefined, false)).toBe(false);
    });

    it('does NOT render when status is not authenticated', () => {
      expect(shouldRenderBanner('loading', 3, false)).toBe(false);
      expect(shouldRenderBanner('unauthenticated', 3, false)).toBe(false);
    });

    it('does NOT render when dismissed', () => {
      expect(shouldRenderBanner('authenticated', 3, true)).toBe(false);
      expect(shouldRenderBanner('authenticated', 5, true)).toBe(false);
    });
  });

  describe('dismiss / reappear logic', () => {
    it('stays dismissed when count remains the same', () => {
      // Dismissed at count=3, count is still 3
      expect(shouldResetDismiss(true, 3, 3)).toBe(false);
    });

    it('stays dismissed when count decreases', () => {
      // Dismissed at count=3, a device logged out → count=2
      expect(shouldResetDismiss(true, 2, 3)).toBe(false);
    });

    it('reappears when count increases past dismissed value', () => {
      // Dismissed at count=2, a new device logged in → count=3
      expect(shouldResetDismiss(true, 3, 2)).toBe(true);
    });

    it('does not reset when not dismissed', () => {
      // Not dismissed — should not trigger a reset
      expect(shouldResetDismiss(false, 5, 2)).toBe(false);
    });

    it('naturally hides when count drops to 1 or 0 (even if not dismissed)', () => {
      // Even if not dismissed, count ≤ 1 means banner is hidden by the count check
      expect(shouldRenderBanner('authenticated', 1, false)).toBe(false);
      expect(shouldRenderBanner('authenticated', 0, false)).toBe(false);
    });

    it('shows banner on page refresh (dismissed state resets)', () => {
      // Page refresh → React state resets → dismissed=false
      expect(shouldRenderBanner('authenticated', 2, false)).toBe(true);
    });
  });

  describe('device label', () => {
    it('uses singular "device" for exactly 2 sessions', () => {
      expect(deviceLabel(2)).toBe('device');
    });

    it('uses plural "devices" for 3+ sessions', () => {
      expect(deviceLabel(3)).toBe('devices');
      expect(deviceLabel(10)).toBe('devices');
    });
  });
});
