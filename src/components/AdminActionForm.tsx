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
            } catch {
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
