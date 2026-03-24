'use client';

import { useSession } from 'next-auth/react';
import { useState, useCallback, useRef, useEffect } from 'react';

/* ------------------------------------------------------------------ *
 *  Module-level dismiss state                                         *
 *                                                                     *
 *  Primary: module-level variables (synchronous, survive remounts).   *
 *  Backup:  sessionStorage (survives full page reloads within the     *
 *           same tab; cleared on sign-out so the banner reappears     *
 *           when the user logs back in).                              *
 *                                                                     *
 *  The banner root div stops mousedown / click propagation so that    *
 *  SessionGuard's window-level activity listener does NOT call        *
 *  update() when the user interacts with the banner — eliminating     *
 *  any session-refetch race with the dismiss action.                  *
 * ------------------------------------------------------------------ */
let bannerDismissed = false;
let bannerDismissedAtCount = 0;

// Hydrate from sessionStorage once at module load time
if (typeof window !== 'undefined') {
  try {
    bannerDismissed =
      sessionStorage.getItem('techhub:banner-dismissed') === '1';
    bannerDismissedAtCount =
      parseInt(sessionStorage.getItem('techhub:banner-dismissed-at') || '0', 10) || 0;
  } catch { /* SSR or storage unavailable */ }
}

function persistDismiss() {
  try {
    if (bannerDismissed) {
      sessionStorage.setItem('techhub:banner-dismissed', '1');
      sessionStorage.setItem('techhub:banner-dismissed-at', String(bannerDismissedAtCount));
    } else {
      sessionStorage.removeItem('techhub:banner-dismissed');
      sessionStorage.removeItem('techhub:banner-dismissed-at');
    }
  } catch { /* ignore */ }
}

/** Prevent mouse events from reaching SessionGuard's window listeners. */
function stopBubble(e: React.MouseEvent) {
  e.stopPropagation();
}

export default function ConcurrentSessionBanner() {
  const { data: session, status, update } = useSession();
  const [tick, setTick] = useState(0);
  const [clearing, setClearing] = useState(false);
  const hasAnimated = useRef(false);
  const prevStatusRef = useRef(status);

  const count = (session as any)?.concurrentSessions ?? 0;

  // Clear dismiss when the user signs out so banner reappears on next login
  useEffect(() => {
    if (prevStatusRef.current === 'authenticated' && status === 'unauthenticated') {
      bannerDismissed = false;
      bannerDismissedAtCount = 0;
      persistDismiss();
    }
    prevStatusRef.current = status;
  }, [status]);

  // Re-show when a genuinely NEW session appears (count exceeds dismissed)
  if (bannerDismissed && count > bannerDismissedAtCount) {
    bannerDismissed = false;
    persistDismiss();
  }

  const visible = status === 'authenticated' && count > 1 && !bannerDismissed;

  if (visible && !hasAnimated.current) hasAnimated.current = true;

  const handleDismiss = useCallback(() => {
    bannerDismissed = true;
    bannerDismissedAtCount = count;
    persistDismiss();
    setTick(t => t + 1);
  }, [count]);

  const handleClearSessions = useCallback(async () => {
    setClearing(true);
    bannerDismissed = true;
    bannerDismissedAtCount = count;
    persistDismiss();
    setTick(t => t + 1);
    try {
      await update({ clearSessions: true });
    } catch { /* ignore */ }
    setClearing(false);
  }, [count, update]);

  void tick; // consumed by render to avoid unused-var lint

  return (
    <div
      role="status"
      aria-live="polite"
      className={`concurrent-banner glass${hasAnimated.current ? ' concurrent-banner-animated' : ''}`}
      style={{ display: visible ? undefined : 'none' }}
      onMouseDown={stopBubble}
      onClick={stopBubble}
    >
        {/* Accent left edge */}
        <div className="concurrent-banner-accent" aria-hidden="true" />

        {/* Icon */}
        <div className="concurrent-banner-icon" aria-hidden="true">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            width={18}
            height={18}
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>

        {/* Content */}
        <div className="concurrent-banner-content">
          <div className="concurrent-banner-title">
            Multiple Active Sessions
          </div>
          <div className="concurrent-banner-body">
            Your account is signed in on{' '}
            <strong>{count}</strong> {count === 2 ? 'device' : 'devices'}.
            If you don&apos;t recognise this activity, change your password immediately.
            {' '}
            <button
              type="button"
              onClick={handleClearSessions}
              disabled={clearing}
              className="concurrent-banner-clear"
            >
              {clearing ? 'Clearing\u2026' : 'Clear other sessions'}
            </button>
          </div>
        </div>

      {/* Dismiss */}
      <button
        onClick={handleDismiss}
        aria-label="Dismiss concurrent session notice"
        className="concurrent-banner-dismiss"
      >
        {'\u2715'}
      </button>
    </div>
  );
}
