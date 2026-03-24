'use client';

import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';

/**
 * Displays a dismissible informational banner when the server detects
 * that the current user has more than one active session (e.g. another
 * browser / device).
 *
 * The banner is purely informational — it does NOT block the user.
 * It can be dismissed for the remainder of the browser tab's lifetime.
 */
export default function ConcurrentSessionBanner() {
  const { data: session, status } = useSession();
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissed state if sessions drop back to 1
  const count = (session as any)?.concurrentSessions ?? 0;
  useEffect(() => {
    if (count <= 1) setDismissed(false);
  }, [count]);

  if (status !== 'authenticated' || count <= 1 || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        left: '1.5rem',
        zIndex: 9998,
        maxWidth: '420px',
        padding: '0.85rem 1.15rem',
        borderRadius: '0.75rem',
        background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
        color: '#fff',
        fontWeight: 500,
        fontSize: '0.875rem',
        boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.75rem',
        animation: 'concurrentBannerSlideIn 0.3s ease-out',
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>
          ℹ️ Multiple Active Sessions
        </div>
        <div style={{ lineHeight: 1.45, opacity: 0.95 }}>
          Your account is signed in on{' '}
          <strong>{count}</strong> {count === 2 ? 'device' : 'devices'}.
          If you don't recognise this activity, change your password immediately.
        </div>
      </div>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss concurrent session notice"
        style={{
          background: 'rgba(255,255,255,0.2)',
          border: 'none',
          borderRadius: '0.375rem',
          color: '#fff',
          cursor: 'pointer',
          padding: '0.25rem 0.5rem',
          fontSize: '0.8rem',
          fontWeight: 600,
          flexShrink: 0,
          lineHeight: 1,
        }}
      >
        ✕
      </button>
      <style>{`
        @keyframes concurrentBannerSlideIn {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
