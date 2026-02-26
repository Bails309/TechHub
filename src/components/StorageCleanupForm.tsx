'use client';

import { useTransition, useState } from 'react';
import HiddenCsrfInput, { getCsrfTokenFromCookie } from './HiddenCsrfInput';
import { AdminActionState } from '../app/admin/actions';

interface StorageCleanupFormProps {
    action: (formData: FormData) => Promise<AdminActionState>;
}

export default function StorageCleanupForm({ action }: StorageCleanupFormProps) {
    const [isPending, startTransition] = useTransition();
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [statusTone, setStatusTone] = useState<'success' | 'error' | null>(null);

    return (
        <form
            action={(formData) => {
                formData.set('csrfToken', getCsrfTokenFromCookie());
                setStatusMessage(null);
                setStatusTone(null);

                // Confirm before engaging a potentially expensive operation
                if (!window.confirm("Are you sure you want to run the orphaned icon cleanup job? This may take a few moments depending on storage size.")) {
                    return;
                }

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
            className="flex items-center gap-3"
        >
            <HiddenCsrfInput />
            <button
                type="submit"
                disabled={isPending}
                className="btn-secondary btn-small disabled:opacity-50"
            >
                {isPending ? 'Cleaning...' : 'Cleanup Orphaned Icons'}
            </button>
            {statusMessage && (
                <span className={`text-xs ${statusTone === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {statusMessage}
                </span>
            )}
        </form>
    );
}
