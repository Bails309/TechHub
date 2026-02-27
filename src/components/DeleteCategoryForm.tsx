'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import HiddenCsrfInput, { getCsrfTokenFromCookie } from './HiddenCsrfInput';
import { Trash2 } from 'lucide-react';

export default function DeleteCategoryForm({
    id,
    name,
    action
}: {
    id: string;
    name: string;
    action: (id: string) => void | Promise<{ success: boolean; error?: string }>;
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

    const handleDelete = async () => {
        setStatusMessage(null);
        setStatusTone(null);

        startTransition(async () => {
            try {
                const res = await action(id);
                if (res && res.success) {
                    setStatusMessage('Category removed.');
                    setStatusTone('success');
                    // Automatically close after a short delay on success
                    setTimeout(() => setIsOpen(false), 1500);
                } else {
                    setStatusMessage(res?.error ?? 'Unable to remove category.');
                    setStatusTone('error');
                }
            } catch (err) {
                setStatusMessage('An unexpected error occurred.');
                setStatusTone('error');
            }
        });
    };

    return (
        <div onClick={(e) => e.stopPropagation()}>
            <button
                type="button"
                onClick={() => {
                    setStatusMessage(null);
                    setStatusTone(null);
                    setIsOpen(true);
                }}
                className="p-2 hover:bg-white/5 rounded-lg text-ink-400 hover:text-red-400 transition"
                title="Delete Category"
                disabled={isPending}
            >
                <Trash2 size={18} />
            </button>

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
                        <h3 className="font-serif text-xl">Remove category?</h3>
                        <p className="mt-2 text-sm text-ink-200">
                            This will remove <span className="font-semibold text-ink-50">{name}</span>. Linked apps will be unlinked.
                        </p>

                        {statusMessage && (
                            <div className={`mt-4 p-3 rounded-xl text-sm ${statusTone === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                                }`}>
                                {statusMessage}
                            </div>
                        )}

                        <div className="mt-6 flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                className="btn-secondary btn-small"
                                disabled={isPending}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleDelete}
                                className="btn-danger btn-small"
                                disabled={isPending}
                            >
                                {isPending ? 'Removing...' : 'Remove Category'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            ) : null}
        </div>
    );
}
