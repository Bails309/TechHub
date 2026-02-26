'use client';

import { useState, useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { forcePasswordReset, type ForcePasswordResetState } from '../app/admin/actions';
import HiddenCsrfInput from './HiddenCsrfInput';

const initialState: ForcePasswordResetState = {
    status: 'idle',
    message: '',
};

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <button
            type="submit"
            disabled={pending}
            className="btn-secondary btn-small whitespace-nowrap"
        >
            {pending ? 'Generating...' : 'Generate New Password'}
        </button>
    );
}

export default function ForcePasswordResetForm({
    userId,
}: {
    userId: string;
}) {
    const [state, formAction] = useFormState(forcePasswordReset, initialState);

    return (
        <form action={formAction} className="flex flex-col gap-2 rounded-2xl border border-ink-800 px-5 py-4">
            <HiddenCsrfInput />
            <input type="hidden" name="userId" value={userId} />

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <p className="font-semibold text-sm">Force Password Reset</p>
                    <p className="text-xs text-ink-300">
                        Generate a new secure password. The user will be required to change it on their next login.
                    </p>
                </div>
                <div className="shrink-0">
                    <SubmitButton />
                </div>
            </div>

            {state.status === 'error' && (
                <div className="text-xs text-rose-400 mt-2">{state.message}</div>
            )}

            {state.status === 'success' && state.generatedPassword && (
                <PasswordDisplay password={state.generatedPassword} />
            )}
        </form>
    );
}

function PasswordDisplay({ password }: { password: string }) {
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (copied) {
            const t = setTimeout(() => setCopied(false), 2000);
            return () => clearTimeout(t);
        }
    }, [copied]);

    return (
        <div className="mt-2 rounded bg-emerald-500/10 border border-emerald-500/20 p-3">
            <p className="text-xs text-emerald-400 mb-2 font-medium">
                Password reset successful. Please securely copy this password and share it with the user:
            </p>
            <div className="flex items-center gap-2">
                <code className="flex-1 bg-ink-900 border border-ink-700 px-3 py-2 rounded text-sm text-ink-50 font-mono select-all">
                    {password}
                </code>
                <button
                    type="button"
                    onClick={() => {
                        navigator.clipboard.writeText(password);
                        setCopied(true);
                    }}
                    className={`btn-small ${copied ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500' : 'btn-secondary'}`}
                    title="Copy to clipboard"
                >
                    {copied ? 'Copied!' : 'Copy'}
                </button>
            </div>
        </div>
    );
}
