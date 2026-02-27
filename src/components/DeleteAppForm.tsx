'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import HiddenCsrfInput, { getCsrfTokenFromCookie } from './HiddenCsrfInput';

export default function DeleteAppForm({
  id,
  name,
  action
}: {
  id: string;
  name: string;
  action: (formData: FormData) => void | Promise<{ status: 'success' | 'error'; message: string }>;
}) {
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<'success' | 'error' | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      document.body.style.overflow = '';
      return;
    }

    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      dialogRef.current?.focus();
      dialogRef.current?.scrollIntoView({ block: 'center' });
    });

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => {
          setStatusMessage(null);
          setStatusTone(null);
          setIsOpen(true);
        }}
        className="btn-danger btn-small"
        disabled={isPending}
      >
        Remove
      </button>
      {statusMessage ? (
        <p className={statusTone === 'success' ? 'text-emerald-600 dark:text-emerald-300 text-xs font-medium' : 'text-rose-600 dark:text-rose-300 text-xs font-medium'}>
          {statusMessage}
        </p>
      ) : null}

      {isOpen && mounted ? createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-6 pointer-events-none">
          <div className="modal-backdrop absolute inset-0 pointer-events-auto" onClick={() => setIsOpen(false)} />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            className="modal-surface relative w-full max-w-md rounded-3xl p-6 shadow-glow pointer-events-auto"
          >
            <h3 className="font-serif text-xl">Remove app?</h3>
            <p className="mt-2 text-sm text-ink-200">
              This will remove <span className="font-semibold">{name}</span> from the portal.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="btn-secondary btn-small"
              >
                Cancel
              </button>
              <form
                action={(formData) => {
                  formData.set('csrfToken', getCsrfTokenFromCookie());
                  startTransition(() => {
                    void (async () => {
                      try {
                        const res = await action(formData);
                        if (res && res.status === 'success') {
                          setStatusMessage(res.message ?? 'App removed.');
                          setStatusTone('success');
                        } else if (res && res.status === 'error') {
                          setStatusMessage(res.message ?? 'Unable to remove app.');
                          setStatusTone('error');
                        } else {
                          setStatusMessage('App removed.');
                          setStatusTone('success');
                        }
                      } catch {
                        setStatusMessage('Unable to remove app.');
                        setStatusTone('error');
                      }
                    })();
                  });
                  setIsOpen(false);
                }}
              >
                <HiddenCsrfInput />
                <input type="hidden" name="id" value={id} />
                <button
                  type="submit"
                  className="btn-danger btn-small"
                  disabled={isPending}
                >
                  {isPending ? 'Removing…' : 'Remove'}
                </button>
              </form>
            </div>
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  );
}
