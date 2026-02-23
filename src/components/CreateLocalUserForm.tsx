'use client';

import { useFormState } from 'react-dom';
import type { Role } from '@prisma/client';
import type { CreateLocalUserState } from '@/app/admin/actions';

type CreateLocalUserFormProps = {
  createLocalUser: (
    prevState: CreateLocalUserState,
    formData: FormData
  ) => Promise<CreateLocalUserState>;
  roles: Role[];
};

const initialState: CreateLocalUserState = { status: 'idle', message: '' };

export default function CreateLocalUserForm({ createLocalUser, roles }: CreateLocalUserFormProps) {
  const [state, formAction] = useFormState(createLocalUser, initialState);

  return (
    <form action={formAction} className="grid gap-3 md:grid-cols-2">
      <input
        name="name"
        placeholder="Full name"
        className="input-surface rounded-full px-4 py-2 text-sm text-ink-100"
      />
      <input
        name="email"
        placeholder="Email"
        type="email"
        required
        className="input-surface rounded-full px-4 py-2 text-sm text-ink-100"
      />
      <input
        name="password"
        placeholder="Temporary password"
        type="password"
        required
        className="input-surface rounded-full px-4 py-2 text-sm text-ink-100"
      />
      <div className="md:col-span-2 space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-ink-400">Assign roles</p>
        <div className="grid gap-2 md:grid-cols-3">
          {roles.map((role) => (
            <label key={role.id} className="flex items-center gap-2 text-xs text-ink-200">
              <input type="checkbox" name="roles" value={role.id} className="h-4 w-4" />
              {role.name}
            </label>
          ))}
        </div>
      </div>
      <button
        type="submit"
        className="md:col-span-2 rounded-full bg-ocean-500 px-4 py-2 text-xs font-semibold text-white hover:bg-ocean-400 transition"
      >
        Create local user
      </button>
      {state.status !== 'idle' ? (
        <p className={state.status === 'success' ? 'text-emerald-300 text-xs md:col-span-2' : 'text-rose-300 text-xs md:col-span-2'}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
