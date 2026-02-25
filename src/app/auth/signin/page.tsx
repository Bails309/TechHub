'use client';

import { useEffect, useState } from 'react';
import { getProviders, signIn } from 'next-auth/react';
import type { ClientSafeProvider } from 'next-auth/react';
import SignInButtons from '../../../components/SignInButtons';

export default function SignInPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [providers, setProviders] = useState<Record<string, ClientSafeProvider> | null>(
    null
  );

  useEffect(() => {
    let mounted = true;
    const loadProviders = async () => {
      const available = await getProviders();
      if (mounted) {
        setProviders(available);
      }
    };
    void loadProviders();
    return () => {
      mounted = false;
    };
  }, []);

  const credentialsEnabled = providers ? Boolean(providers.credentials) : true;

  async function handleCredentials(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);

    const form = event.currentTarget;
    const email = form.email.value as string;
    const password = form.password.value as string;

    await signIn('credentials', {
      email,
      password,
      callbackUrl: '/auth/post-login'
    });

    setIsSubmitting(false);
  }

  return (
    <div className="px-6 md:px-12 py-12">
      <div className="max-w-xl mx-auto card-panel md:p-10 space-y-8">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-ink-300">Access</p>
          <h1 className="font-serif text-3xl">Sign in to TechHub</h1>
        </div>

        <SignInButtons providers={providers} focusCredentials />

        {credentialsEnabled ? (
          <form id="credentials" onSubmit={handleCredentials} className="space-y-4">
            <div>
              <label className="form-label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="input-field"
              />
            </div>
            <div>
              <label className="form-label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="input-field"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary w-full"
            >
              Sign in with credentials
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
