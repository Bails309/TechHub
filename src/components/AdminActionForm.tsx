'use client';

import type { ReactNode } from 'react';
import { useState, useTransition } from 'react';

type AdminActionFormProps = {
  action: (formData: FormData) => void | Promise<void>;
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

  return (
    <form
      action={(formData) => {
        setMessage(null);
        setTone(null);
        startTransition(() => {
          void (async () => {
            try {
              await action(formData);
              setMessage(successMessage);
              setTone('success');
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
      {children}
      {message ? (
        <p
          className={
            tone === 'success'
              ? 'text-emerald-300 text-xs'
              : 'text-rose-300 text-xs'
          }
        >
          {message}
        </p>
      ) : null}
      {isPending ? <span className="text-xs text-ink-400">Working...</span> : null}
    </form>
  );
}
