'use client';

import { signIn } from 'next-auth/react';

export default function SignInButtons({
  focusCredentials = false
}: {
  focusCredentials?: boolean;
}) {
  const handleCredentials = () => {
    if (focusCredentials) {
      document.getElementById('credentials')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    void signIn();
  };

  return (
    <div className="flex flex-wrap gap-3">
      <button
        type="button"
        onClick={() => signIn('azure-ad')}
        className="rounded-full bg-ocean-500 px-5 py-3 text-sm font-semibold text-white hover:bg-ocean-400 transition"
      >
        Sign in with Microsoft
      </button>
      <button
        type="button"
        onClick={handleCredentials}
        className="rounded-full border border-ink-600 px-5 py-3 text-sm font-semibold text-ink-100 hover:border-ink-300 transition"
      >
        Use credentials
      </button>
    </div>
  );
}
