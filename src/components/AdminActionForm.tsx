"use client";

import type { ReactNode } from 'react';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import HiddenCsrfInput, { getCsrfTokenFromCookie } from './HiddenCsrfInput';

type AdminActionFormProps = {
  action: (formData: FormData) => void | Promise<void | { status: 'idle' | 'success' | 'error'; message: string }>;
  successMessage?: string;
  errorMessage?: string;
  className?: string;
  children: ReactNode;
};

export default function AdminActionForm({
  action,
  successMessage = 'Saved successfully.',
  errorMessage = 'Something went wrong. Try again.',
  className,
  children
}: AdminActionFormProps) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<'success' | 'error' | null>(null);
  const router = useRouter();

  return (
    <form
      action={(formData) => {
        formData.set('csrfToken', getCsrfTokenFromCookie());
        setMessage(null);
        setTone(null);
        startTransition(() => {
          void (async () => {
            try {
              const res = await action(formData);
              if (res && typeof res === 'object' && 'status' in res) {
                const state = res as { status: string; message: string };
                if (state.status === 'error') {
                  setMessage(state.message || errorMessage);
                  setTone('error');
                } else {
                  setMessage(state.message || successMessage);
                  setTone('success');
                  // If the action requested a full reload (layout-level server data), do it.
                  // The server action can return `{ reload: true }` to request this.
                  // Prefer a soft refresh otherwise.
                  try {
                    const anyState = state as unknown as Record<string, unknown>;
                    if (anyState.reload) {
                      window.location.reload();
                    } else {
                      router.refresh();
                    }
                  } catch {
                    // ignore in environments where router may not be available
                  }
                }
                } else {
                  setMessage(successMessage);
                  setTone('success');
                  try { router.refresh(); } catch {}
                }
            } catch (err: unknown) {
              function isNextRedirectLike(error: unknown) {
                if (typeof error !== 'object' || error === null) return false;
                const rec = error as Record<string, unknown>;
                if (rec.digest === 'NEXT_REDIRECT') return true;
                if (typeof rec.message === 'string' && rec.message.includes('NEXT_REDIRECT')) return true;
                if (Boolean(rec.__next_redirect__)) return true;
                return false;
              }

              if (isNextRedirectLike(err)) throw err;
              setMessage(errorMessage);
              setTone('error');
            }
          })();
        });
      }}
      className={className}
    >
      <HiddenCsrfInput />
      {children}
      {message ? (
        <p
          className={
            tone === 'success'
              ? 'text-emerald-600 dark:text-emerald-300 text-xs font-medium'
              : 'text-rose-600 dark:text-rose-300 text-xs font-medium'
          }
        >
          {message}
        </p>
      ) : null}
      {isPending ? <span className="text-xs text-ink-400">Working...</span> : null}
    </form>
  );
}
