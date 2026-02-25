'use client';

import { useEffect } from 'react';
import { useFormState } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { changePassword, ChangePasswordState } from './actions';
import HiddenCsrfInput from '@/components/HiddenCsrfInput';

const initialState: ChangePasswordState = { status: 'idle', message: '' };

export default function ChangePasswordPage() {
  const [state, formAction] = useFormState(changePassword, initialState);
  const router = useRouter();
  const { update } = useSession();

  useEffect(() => {
    if (state.status === 'success') {
      void update({ user: { mustChangePassword: false } as { mustChangePassword: boolean } });
      router.replace('/');
    }
  }, [state.status, update, router]);

  return (
    <div className="px-6 md:px-12 py-12">
      <div className="max-w-xl mx-auto glass rounded-[36px] p-10 space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-ink-300">Security</p>
          <h1 className="font-serif text-3xl">Update your password</h1>
          <p className="text-sm text-ink-200 mt-2">
            Set a new password to finish activating your account.
          </p>
        </div>

        <form action={formAction} className="space-y-4">
          <HiddenCsrfInput />
          <div>
            <label className="text-sm text-ink-200" htmlFor="currentPassword">
              Current password
            </label>
            <input
              id="currentPassword"
              name="currentPassword"
              type="password"
              required
              className="mt-2 w-full rounded-2xl border border-ink-700 bg-transparent px-4 py-3 text-ink-100"
            />
          </div>
          <div>
            <label className="text-sm text-ink-200" htmlFor="newPassword">
              New password
            </label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              required
              className="mt-2 w-full rounded-2xl border border-ink-700 bg-transparent px-4 py-3 text-ink-100"
            />
          </div>
          <div>
            <label className="text-sm text-ink-200" htmlFor="confirmPassword">
              Confirm new password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              className="mt-2 w-full rounded-2xl border border-ink-700 bg-transparent px-4 py-3 text-ink-100"
            />
          </div>
          <button
            type="submit"
            disabled={state.pending}
            className="w-full rounded-full bg-bronze-500 px-5 py-3 text-sm font-semibold text-white hover:bg-bronze-400 transition disabled:opacity-60"
          >
            {state.pending ? 'Updating…' : 'Update password'}
          </button>
          {state.status !== 'idle' ? (
            <p className={state.status === 'success' ? 'text-emerald-300 text-xs' : 'text-rose-300 text-xs'}>
              {state.message}
            </p>
          ) : null}
        </form>
      </div>
    </div>
  );
}
