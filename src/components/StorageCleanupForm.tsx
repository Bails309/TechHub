'use client';

import { useTransition, useState } from 'react';
import HiddenCsrfInput from './HiddenCsrfInput';
import { AdminActionState } from '../app/admin/actions';
import { useCsrfToken } from './CsrfProvider';

interface StorageCleanupFormProps {
    action: (formData: FormData) => Promise<AdminActionState>;
}

export default function StorageCleanupForm({ action }: StorageCleanupFormProps) {
    const [isPending, startTransition] = useTransition();
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [statusTone, setStatusTone] = useState<'success' | 'error' | null>(null);
    const [isConfirming, setIsConfirming] = useState(false);
    const csrfToken = useCsrfToken();

    if (isConfirming) {
        return (
            <div className="card-panel py-4 px-6 border-ocean-500/30 bg-ocean-500/5 flex flex-col md:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2">
                <div className="flex-1">
                    <p className="text-sm font-semibold text-ocean-700 dark:text-ocean-200">Clean up orphaned icons?</p>
                    <p className="text-xs text-ink-600 dark:text-ink-400">This will scan your storage and remove icons that are no longer linked to any apps. This process may take a few moments.</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    <button
                        type="button"
                        onClick={() => setIsConfirming(false)}
                        className="btn-secondary btn-small"
                    >
                        Cancel
                    </button>
                    <form
                        action={(formData) => {
                            formData.set('csrfToken', csrfToken);
                            setStatusMessage(null);
                            setStatusTone(null);
                            setIsConfirming(false);

                            startTransition(() => {
                                void (async () => {
                                    try {
                                        const result = await action(formData);
                                        if (result && result.status === 'success') {
                                            setStatusMessage(result.message);
                                            setStatusTone('success');
                                        } else {
                                            setStatusMessage(result?.message ?? 'Failed to run cleanup.');
                                            setStatusTone('error');
                                        }
                                    } catch {
                                        setStatusMessage('An unexpected error occurred.');
                                        setStatusTone('error');
                                    }
                                })();
                            });
                        }}
                    >
                        <HiddenCsrfInput />
                        <button
                            type="submit"
                            disabled={isPending}
                            className="btn-primary btn-small !bg-ocean-500 hover:!bg-ocean-400"
                        >
                            {isPending ? 'Cleaning...' : 'Confirm Cleanup'}
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-3">
            <button
                type="button"
                onClick={() => setIsConfirming(true)}
                disabled={isPending}
                className="btn-secondary btn-small disabled:opacity-50"
            >
                Cleanup Orphaned Icons
            </button>
            {statusMessage && (
                <span className={`text-xs ${statusTone === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {statusMessage}
                </span>
            )}
        </div>
    );
}
