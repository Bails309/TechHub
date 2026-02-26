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

    // Read timeout config from session (set by the server in the session callback)
    const s = session as any;
    const idleTimeoutMs = s?.idleTimeoutMs ?? FALLBACK_IDLE_MS;
    const warningMs = s?.warningMs ?? FALLBACK_WARNING_MS;

    // React to server-side session revocation
    useEffect(() => {
        if (s?.revoked) {
            signOut({ callbackUrl: '/auth/signin' });
        }
    }, [s?.revoked]);

    // Debounced activity tracker — updates the timestamp at most once per second
    const activityDebounceRef = useRef(false);
    const markActivity = useCallback(() => {
        if (activityDebounceRef.current || signingOutRef.current) return;
        activityDebounceRef.current = true;
        const now = Date.now();
        lastActivityRef.current = now;

        // Notify the server of activity to reset its idle timer.
        update({ interacted: now });

        // If warning is showing and user interacts, dismiss it
        setShowWarning(false);
        if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
        }

        setTimeout(() => {
            activityDebounceRef.current = false;
        }, 1000);
    }, [update]);

    useEffect(() => {
        if (status !== 'authenticated') return;

        // Initialize last activity to now
        lastActivityRef.current = Date.now();

        const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
        activityEvents.forEach((event) => {
            window.addEventListener(event, markActivity, { passive: true });
        });

        // Periodic check: has the user been idle too long?
        checkIntervalRef.current = setInterval(() => {
            if (signingOutRef.current) return;
            const idle = Date.now() - lastActivityRef.current;
            const warningThreshold = idleTimeoutMs - warningMs;

            if (idle >= idleTimeoutMs) {
                // Time's up — persist reason then sign out.
                // Clear ALL intervals first to guarantee no duplicate calls.
                signingOutRef.current = true;
                if (checkIntervalRef.current) { clearInterval(checkIntervalRef.current); checkIntervalRef.current = null; }
                if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }
                idleSignOut(update);
                return;
            }

            if (idle >= warningThreshold && !countdownIntervalRef.current) {
                // Show the warning with countdown
                const remaining = idleTimeoutMs - idle;
                setCountdown(Math.ceil(remaining / 1000));
                setShowWarning(true);

                countdownIntervalRef.current = setInterval(() => {
                    if (signingOutRef.current) return;
                    const currentIdle = Date.now() - lastActivityRef.current;
                    const left = idleTimeoutMs - currentIdle;
                    if (left <= 0) {
                        signingOutRef.current = true;
                        if (checkIntervalRef.current) { clearInterval(checkIntervalRef.current); checkIntervalRef.current = null; }
                        if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }
                        idleSignOut(update);
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
    }, [status, markActivity, idleTimeoutMs, warningMs, update]);

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
