'use client';

import { useEffect, useRef } from 'react';
import { useFormState } from 'react-dom';
import { useSession } from 'next-auth/react';
import { changePassword, ChangePasswordState } from '@/app/auth/change-password/actions';
import HiddenCsrfInput from '@/components/HiddenCsrfInput';

const initialState: ChangePasswordState = { status: 'idle', message: '' };

interface ChangePasswordFormProps {
    onSuccess?: () => void;
}

export default function ChangePasswordForm({ onSuccess }: ChangePasswordFormProps) {
    const [state, formAction] = useFormState(changePassword, initialState);
    const { update } = useSession();
    const successHandled = useRef(false);

    useEffect(() => {
        if (state.status === 'success' && !successHandled.current) {
            successHandled.current = true;
            const finish = async () => {
                await update({ user: { mustChangePassword: false } as { mustChangePassword: boolean } });
                if (onSuccess) {
                    onSuccess();
                }
            };
            void finish();
        }
    }, [state.status, update, onSuccess]);

    return (
        <form action={formAction} className="space-y-4">
            <HiddenCsrfInput />
            <div>
                <label className="form-label" htmlFor="currentPassword">
                    Current password
                </label>
                <input
                    id="currentPassword"
                    name="currentPassword"
                    type="password"
                    required
                    className="input-field"
                />
            </div>
            <div>
                <label className="form-label" htmlFor="newPassword">
                    New password
                </label>
                <input
                    id="newPassword"
                    name="newPassword"
                    type="password"
                    required
                    className="input-field"
                />
            </div>
            <div>
                <label className="form-label" htmlFor="confirmPassword">
                    Confirm new password
                </label>
                <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    required
                    className="input-field"
                />
            </div>
            <button
                type="submit"
                disabled={state.pending}
                className="btn-primary w-full"
            >
                {state.pending ? 'Updating…' : 'Update password'}
            </button>
            {state.status !== 'idle' ? (
                <p className={state.status === 'success' ? 'text-emerald-300 text-xs text-center' : 'text-rose-300 text-xs text-center'}>
                    {state.message}
                </p>
            ) : null}
        </form>
    );
}
