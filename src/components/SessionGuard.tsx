'use client';

import { useSession, signOut } from 'next-auth/react';
import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Client-side session guard that warns users before their session
 * expires due to inactivity. This complements the server-side idle
 * timeout — it does NOT replace it.
 *
 * Timeout values are passed through the NextAuth session object from
 * the server, avoiding NEXT_PUBLIC_* build-time env var issues in Docker.
 *
 * Behaviour:
 * 1. Reads timeout config from the session (server is source of truth).
 * 2. Tracks user activity (click, keyboard, touch, scroll) with debouncing.
 * 3. Polls every 10 seconds to check idle time.
 * 4. When idle for (timeout - warningBuffer), shows a warning banner.
 * 5. If the user resumes activity during the warning, the timer resets.
 * 6. If the server revokes the session, signs out immediately.
 * 7. If the warning expires without activity, writes the reason into
 *    the JWT (via update()) and THEN signs the user out so the audit
 *    log captures the correct event.
 */

const CHECK_INTERVAL_MS = 10_000; // poll every 10s
const FALLBACK_IDLE_MS = 20 * 60 * 1000; // 20 min fallback
const FALLBACK_WARNING_MS = 2 * 60 * 1000; // 2 min fallback
const ACTIVITY_DEBOUNCE_MS = 30_000; // 30s debounce to prevent update() loops

// Module-level ref to persist across re-renders/soft-mounts
let activityDebounceActive = false;

/** Persist the idle-timeout reason into the JWT, then sign out. */
async function idleSignOut(updateFn: ReturnType<typeof useSession>['update']) {
    try {
        // Write the reason into the JWT cookie BEFORE calling signOut().
        // NextAuth's signOut handler reads the raw cookie — it does NOT
        // run the jwt callback — so this is the only way to communicate
        // the reason to the server-side signOut event.
        await updateFn({ logoutReason: 'idle_timeout' });
    } catch {
        // Even if the update fails (e.g. network issue), still sign out.
    }
    signOut({ callbackUrl: '/auth/signin' });
}

export default function SessionGuard() {
    const { data: session, status, update } = useSession();
    const [showWarning, setShowWarning] = useState(false);
    const [countdown, setCountdown] = useState(0);
    const lastActivityRef = useRef(Date.now());
    const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const signingOutRef = useRef(false);

    // Stable refs for values that change on every session refetch.
    // This prevents the main useEffect from re-running (and resetting the
    // idle timer) every time SessionProvider auto-refetches.
    const updateRef = useRef(update);
    updateRef.current = update;

    const s = session as any;
    const idleTimeoutMs = s?.idleTimeoutMs ?? FALLBACK_IDLE_MS;
    const warningMs = s?.warningMs ?? FALLBACK_WARNING_MS;
    const idleTimeoutRef = useRef(idleTimeoutMs);
    idleTimeoutRef.current = idleTimeoutMs;
    const warningRef = useRef(warningMs);
    warningRef.current = warningMs;

    // React to server-side session revocation
    useEffect(() => {
        if (s?.revoked) {
            signOut({ callbackUrl: '/auth/signin' });
        }
    }, [s?.revoked]);

    // Debounced activity tracker — reads update via ref so the callback
    // identity is stable and won't cause the effect to re-run.
    const markActivity = useCallback(() => {
        if (activityDebounceActive || signingOutRef.current) return;
        activityDebounceActive = true;
        const now = Date.now();
        lastActivityRef.current = now;

        // Notify the server of activity to reset its idle timer.
        updateRef.current({ interacted: now });

        // If warning is showing and user interacts, dismiss it
        setShowWarning(false);
        if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
        }

        setTimeout(() => {
            activityDebounceActive = false;
        }, ACTIVITY_DEBOUNCE_MS);
    }, []); // stable — no deps, reads everything via refs

    useEffect(() => {
        if (status !== 'authenticated') return;

        // Initialize last activity to now (only on first mount / status change)
        lastActivityRef.current = Date.now();

        const activityEvents = ['mousedown', 'keydown', 'touchstart', 'click'];
        activityEvents.forEach((event) => {
            window.addEventListener(event, markActivity, { passive: true });
        });

        // Periodic check: has the user been idle too long?
        // Reads timeout values from refs so the interval always uses the
        // latest server-provided config without the effect re-running.
        checkIntervalRef.current = setInterval(() => {
            if (signingOutRef.current) return;
            const idle = Date.now() - lastActivityRef.current;
            const curTimeout = idleTimeoutRef.current;
            const curWarning = warningRef.current;
            const warningThreshold = curTimeout - curWarning;

            if (idle >= curTimeout) {
                // Time's up — persist reason then sign out.
                // Clear ALL intervals first to guarantee no duplicate calls.
                signingOutRef.current = true;
                if (checkIntervalRef.current) { clearInterval(checkIntervalRef.current); checkIntervalRef.current = null; }
                if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }
                idleSignOut(updateRef.current);
                return;
            }

            if (idle >= warningThreshold && !countdownIntervalRef.current) {
                // Show the warning with countdown
                const remaining = curTimeout - idle;
                setCountdown(Math.ceil(remaining / 1000));
                setShowWarning(true);

                countdownIntervalRef.current = setInterval(() => {
                    if (signingOutRef.current) return;
                    const currentIdle = Date.now() - lastActivityRef.current;
                    const left = idleTimeoutRef.current - currentIdle;
                    if (left <= 0) {
                        signingOutRef.current = true;
                        if (checkIntervalRef.current) { clearInterval(checkIntervalRef.current); checkIntervalRef.current = null; }
                        if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }
                        idleSignOut(updateRef.current);
                    } else {
                        setCountdown(Math.ceil(left / 1000));
                    }
                }, 1000);
            }
        }, CHECK_INTERVAL_MS);

        return () => {
            activityEvents.forEach((event) => {
                window.removeEventListener(event, markActivity);
            });
            if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        };
    }, [status, markActivity]); // stable deps only — timeout values read via refs

    if (status !== 'authenticated' || !showWarning) return null;

    const minutes = Math.floor(countdown / 60);
    const seconds = countdown % 60;

    return (
        <div
            role="alert"
            style={{
                position: 'fixed',
                bottom: '1.5rem',
                right: '1.5rem',
                zIndex: 9999,
                maxWidth: '400px',
                padding: '1rem 1.25rem',
                borderRadius: '0.75rem',
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: '#1a1a1a',
                fontWeight: 500,
                fontSize: '0.9rem',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                display: 'flex',
                flexDirection: 'column' as const,
                gap: '0.5rem',
                animation: 'sessionGuardSlideIn 0.3s ease-out',
            }}
        >
            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                ⚠️ Session Expiring
            </div>
            <div>
                Your session will expire in{' '}
                <strong>
                    {minutes > 0 ? `${minutes}m ` : ''}{seconds.toString().padStart(2, '0')}s
                </strong>{' '}
                due to inactivity. Click or press a key to stay signed in.
            </div>
            <style>{`
        @keyframes sessionGuardSlideIn {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
        </div>
    );
}
