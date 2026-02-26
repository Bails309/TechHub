'use client';

import { useSession, signOut } from 'next-auth/react';
import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Client-side session guard that warns users before their session
 * expires due to inactivity. This complements the server-side idle
 * timeout — it does NOT replace it.
 *
 * Behaviour:
 * 1. Tracks user activity (mouse, keyboard, touch, scroll).
 * 2. When idle for (timeout - warningBuffer), shows a warning banner.
 * 3. If the user resumes activity during the warning, the timer resets.
 * 4. If the warning expires without activity, signs the user out.
 */

const IDLE_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_MS ?? 1200000); // 20 min
const WARNING_BEFORE_MS = 120000; // Show warning 2 minutes before expiry

export default function SessionGuard() {
    const { data: session, status } = useSession();
    const [showWarning, setShowWarning] = useState(false);
    const [countdown, setCountdown] = useState(0);
    const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const countdownInterval = useRef<ReturnType<typeof setInterval> | null>(null);

    const clearAllTimers = useCallback(() => {
        if (idleTimer.current) clearTimeout(idleTimer.current);
        if (warningTimer.current) clearTimeout(warningTimer.current);
        if (countdownInterval.current) clearInterval(countdownInterval.current);
    }, []);

    const resetTimers = useCallback(() => {
        clearAllTimers();
        setShowWarning(false);

        // Start the warning timer (fires 2 min before timeout)
        const warningDelay = Math.max(IDLE_TIMEOUT_MS - WARNING_BEFORE_MS, 0);
        idleTimer.current = setTimeout(() => {
            setShowWarning(true);
            setCountdown(Math.floor(WARNING_BEFORE_MS / 1000));

            // Countdown every second
            countdownInterval.current = setInterval(() => {
                setCountdown((prev) => {
                    if (prev <= 1) {
                        clearAllTimers();
                        signOut({ callbackUrl: '/auth/signin' });
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }, warningDelay);
    }, [clearAllTimers]);

    useEffect(() => {
        if (status !== 'authenticated') return;

        const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
        const handleActivity = () => {
            // Only reset if the warning banner is not showing, OR if
            // user interacts during the warning (which means they're back).
            resetTimers();
        };

        activityEvents.forEach((event) => {
            window.addEventListener(event, handleActivity, { passive: true });
        });

        // Start the initial timer
        resetTimers();

        return () => {
            clearAllTimers();
            activityEvents.forEach((event) => {
                window.removeEventListener(event, handleActivity);
            });
        };
    }, [status, resetTimers, clearAllTimers]);

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
                animation: 'slideIn 0.3s ease-out',
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
                due to inactivity. Move your mouse or press a key to stay signed in.
            </div>
            <style>{`
        @keyframes slideIn {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
        </div>
    );
}
