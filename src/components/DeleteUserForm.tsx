"use client";

import React, { useState, type ChangeEvent } from 'react';
import AdminActionForm from './AdminActionForm';

type Props = {
  userId: string;
  userEmail?: string | null;
  action: (formData: FormData) => void | Promise<void | { status: 'idle' | 'success' | 'error'; message: string }>;
};

export default function DeleteUserForm({ userId, userEmail, action }: Props) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');

  const normalized = (userEmail ?? '').toLowerCase();
  const matches = typed.trim().toLowerCase() === normalized && normalized.length > 0;

  return (
    <div>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full border border-rose-400 px-3 py-1 text-xs text-rose-300 hover:bg-rose-500/10 transition"
        >
          Delete
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <AdminActionForm action={action} successMessage="User deleted.">
            <input type="hidden" name="userId" value={userId} />
            <input
              name="confirmEmail"
              placeholder={userEmail ? `Type ${userEmail} to confirm` : 'Type email to confirm'}
              value={typed}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setTyped(e.target.value)}
              className="input-surface rounded-full px-3 py-1 text-xs text-ink-100"
            />
            <button
              type="submit"
              disabled={!matches}
              className="rounded-full bg-rose-500 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-400 transition disabled:opacity-50"
            >
              Confirm delete
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-ink-700 px-3 py-1 text-xs text-ink-200 hover:border-ink-400 transition"
            >
              Cancel
            </button>
          </AdminActionForm>
        </div>
      )}
    </div>
  );
}
