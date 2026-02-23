'use client';

import { useFormState } from 'react-dom';
import type { SsoRotationState } from '@/app/admin/actions';

type SsoRotationFormProps = {
  rotateSsoSecrets: (
    prevState: SsoRotationState,
    formData: FormData
  ) => Promise<SsoRotationState>;
};

const initialState: SsoRotationState = { status: 'idle', message: '' };

export default function SsoRotationForm({ rotateSsoSecrets }: SsoRotationFormProps) {
  const [state, formAction] = useFormState(rotateSsoSecrets, initialState);

  return (
    <form action={formAction} className="grid gap-3 md:grid-cols-2">
      <div className="space-y-2 md:col-span-2">
        <label className="text-xs uppercase tracking-[0.2em] text-ink-400">
          Target key id
        </label>
        <p className="text-xs text-ink-300">
          Leave empty to use the current key id from your key ring.
        </p>
        <input
          name="targetKeyId"
          placeholder="e.g. 2025-02"
          className="input-surface w-full rounded-full px-4 py-2 text-sm text-ink-100"
        />
      </div>
      <div className="space-y-2 md:col-span-2">
        <label className="text-xs uppercase tracking-[0.2em] text-ink-400">
          Rotate only from key id (optional)
        </label>
        <p className="text-xs text-ink-300">
          Restrict rotation to secrets encrypted with a specific key id.
        </p>
        <input
          name="fromKeyId"
          placeholder="e.g. 2024-12"
          className="input-surface w-full rounded-full px-4 py-2 text-sm text-ink-100"
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-ink-200 md:col-span-2">
        <input type="checkbox" name="dryRun" defaultChecked className="h-4 w-4" />
        Dry run (no database writes)
      </label>
      <label className="flex items-center gap-2 text-sm text-ink-200 md:col-span-2">
        <input type="checkbox" name="confirmApply" className="h-4 w-4" />
        Confirm applying changes (required when dry run is off)
      </label>
      <button
        type="submit"
        className="md:col-span-2 rounded-full bg-ocean-500 px-4 py-2 text-xs font-semibold text-white hover:bg-ocean-400 transition"
      >
        Run rotation
      </button>
      {state.status !== 'idle' ? (
        <p
          className={
            state.status === 'success'
              ? 'text-emerald-300 text-xs md:col-span-2'
              : 'text-rose-300 text-xs md:col-span-2'
          }
        >
          {state.message}
        </p>
      ) : null}
      {state.details ? (
        <div className="md:col-span-2 text-xs text-ink-300">
          <div>Updated: {state.details.updated}</div>
          <div>Skipped: {state.details.skipped}</div>
          <div>Failed: {state.details.failed}</div>
          <div>Target key: {state.details.targetKeyId}</div>
          {state.details.fromKeyId ? <div>From key: {state.details.fromKeyId}</div> : null}
        </div>
      ) : null}
    </form>
  );
}
