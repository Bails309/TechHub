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
  console.log('[SIGNIN_BUTTONS] Providers received:', JSON.stringify(providers));
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
      {/* Target specific known providers first for specialized labeling if needed */}
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

      {/* Fallback for any other SSO providers that aren't azure-ad, keycloak, or credentials */}
      {providers && Object.values(providers).map(provider => {
        if (['azure-ad', 'keycloak', 'credentials'].includes(provider.id)) return null;
        return (
          <button
            key={provider.id}
            type="button"
            onClick={() => signIn(provider.id, { callbackUrl })}
            className="btn-secondary"
          >
            Sign in with {provider.name}
          </button>
        );
      })}

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
