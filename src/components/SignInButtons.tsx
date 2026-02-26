'use client';

import { signIn } from 'next-auth/react';
import type { ClientSafeProvider } from 'next-auth/react';

export default function SignInButtons({
  providers,
  focusCredentials = false,
  callbackUrl = '/auth/post-login'
}: {
  providers: Record<string, ClientSafeProvider> | null;
  focusCredentials?: boolean;
  callbackUrl?: string;
}) {
  const azureProvider = providers?.['azure-ad'];
  const keycloakProvider = providers?.keycloak;
  const credentialsProvider = providers?.credentials;
  const showCredentialsFallback = providers === null;

  const handleCredentials = () => {
    if (!credentialsProvider) {
      return;
    }
    if (focusCredentials) {
      document.getElementById('credentials')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    void signIn('credentials', { callbackUrl });
  };

  return (
    <div className="flex flex-wrap gap-3">
      {azureProvider ? (
        <button
          type="button"
          onClick={() => signIn('azure-ad', { callbackUrl })}
          className="btn-primary"
        >
          Sign in with Microsoft
        </button>
      ) : null}
      {keycloakProvider ? (
        <button
          type="button"
          onClick={() => signIn('keycloak', { callbackUrl })}
          className="btn-secondary"
        >
          Sign in with Keycloak
        </button>
      ) : null}
      {credentialsProvider || showCredentialsFallback ? (
        <button
          type="button"
          onClick={handleCredentials}
          className="btn-secondary"
        >
          Use credentials
        </button>
      ) : null}
    </div>
  );
}
