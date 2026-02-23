'use client';

import { useEffect, useRef, useState, useTransition } from 'react';

export default function DeleteAppForm({
  id,
  name,
  action
}: {
  id: string;
  name: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<'success' | 'error' | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

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
    <>
      <button
        type="button"
        onClick={() => {
          setStatusMessage(null);
          setStatusTone(null);
          setIsOpen(true);
        }}
        className="rounded-full bg-red-500/90 px-4 py-2 text-xs font-semibold text-white shadow-glow/20 transition hover:bg-red-400 disabled:opacity-60"
        disabled={isPending}
      >
        Remove
      </button>
      {statusMessage ? (
        <p className={statusTone === 'success' ? 'text-emerald-300 text-xs' : 'text-rose-300 text-xs'}>
          {statusMessage}
        </p>
      ) : null}

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="modal-backdrop absolute inset-0" onClick={() => setIsOpen(false)} />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            className="modal-surface relative w-full max-w-md rounded-3xl p-6 shadow-glow"
          >
            <h3 className="font-serif text-xl">Remove app?</h3>
            <p className="mt-2 text-sm text-ink-200">
              This will remove <span className="font-semibold">{name}</span> from the portal.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-full border border-ink-600 px-4 py-2 text-xs text-ink-200 hover:border-ink-300 transition"
              >
                Cancel
              </button>
              <form
                action={(formData) => {
                  startTransition(() => {
                    void (async () => {
                      try {
                        await action(formData);
                        setStatusMessage('App removed.');
                        setStatusTone('success');
                      } catch {
                        setStatusMessage('Unable to remove app.');
                        setStatusTone('error');
                      }
                    })();
                  });
                  setIsOpen(false);
                }}
              >
                <input type="hidden" name="id" value={id} />
                <button
                  type="submit"
                  className="rounded-full bg-red-500/90 px-4 py-2 text-xs font-semibold text-white shadow-glow/20 transition hover:bg-red-400 disabled:opacity-60"
                  disabled={isPending}
                >
                  {isPending ? 'Removing…' : 'Remove'}
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
