'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useFormState } from 'react-dom';
import { updateSsoConfig } from '@/app/admin/actions';

export type SsoFormConfig = {
  enabled: boolean;
  clientId?: string | null;
  tenantId?: string | null;
  issuer?: string | null;
  hasSecret: boolean;
  secretValid?: boolean | null;
  updatedAt?: string | null;
  source?: 'db' | 'env' | null;
};

type ActionState = {
  status: 'idle' | 'success' | 'error';
  message: string;
};

const initialState: ActionState = { status: 'idle', message: '' };

type ProviderCardProps = {
  title: string;
  description: string;
  source?: 'db' | 'env' | null;
  children: ReactNode;
};

function ProviderCard({ title, description, source, children }: ProviderCardProps) {
  const badge = source === 'db' ? 'Configured in admin' : source === 'env' ? 'Configured in .env' : null;
  return (
    <div className="rounded-3xl border border-ink-800 p-6 space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-serif text-xl">{title}</h3>
          {badge ? (
            <span className="rounded-full border border-ink-700 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-ink-300">
              {badge}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-ink-300 mt-1">{description}</p>
      </div>
      {children}
    </div>
  );
}

function StatusBadge({ state }: { state: ActionState }) {
  if (state.status === 'idle') {
    return null;
  }
  const tone = state.status === 'success' ? 'text-emerald-300' : 'text-rose-300';
  return <p className={`text-xs ${tone}`}>{state.message}</p>;
}

export default function SsoConfigForm({
  azure,
  keycloak,
  credentials,
  hasMasterKey,
  defaultClientId
}: {
  azure: SsoFormConfig | null;
  keycloak: SsoFormConfig | null;
  credentials: SsoFormConfig | null;
  hasMasterKey: boolean;
  defaultClientId: string;
}) {
  const [azureState, azureAction] = useFormState(updateSsoConfig, initialState);
  const [keycloakState, keycloakAction] = useFormState(updateSsoConfig, initialState);
  const [credentialsState, credentialsAction] = useFormState(updateSsoConfig, initialState);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const azureCallback = `${origin}/api/auth/callback/azure-ad`;
  const keycloakCallback = `${origin}/api/auth/callback/keycloak`;

  const [azureForm, setAzureForm] = useState(() => ({
    enabled: azure?.enabled ?? false,
    clientId: azure?.clientId ?? defaultClientId,
    tenantId: azure?.tenantId ?? '',
    clientSecret: '',
    clearSecret: false
  }));

  const [keycloakForm, setKeycloakForm] = useState(() => ({
    enabled: keycloak?.enabled ?? false,
    clientId: keycloak?.clientId ?? defaultClientId,
    issuer: keycloak?.issuer ?? '',
    clientSecret: '',
    clearSecret: false
  }));

  useEffect(() => {
    setAzureForm({
      enabled: azure?.enabled ?? false,
      clientId: azure?.clientId ?? defaultClientId,
      tenantId: azure?.tenantId ?? '',
      clientSecret: '',
      clearSecret: false
    });
  }, [azure?.enabled, azure?.clientId, azure?.tenantId, defaultClientId]);

  useEffect(() => {
    setKeycloakForm({
      enabled: keycloak?.enabled ?? false,
      clientId: keycloak?.clientId ?? defaultClientId,
      issuer: keycloak?.issuer ?? '',
      clientSecret: '',
      clearSecret: false
    });
  }, [keycloak?.enabled, keycloak?.clientId, keycloak?.issuer, defaultClientId]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-ink-800/60 bg-ink-900/30 px-4 py-3 text-xs text-ink-300">
        SSO accounts must be explicitly linked to local users by an admin via the Link SSO Account form. Linked accounts will have local passwords cleared on link/first SSO login.
      </div>
      {!hasMasterKey ? (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <p className="font-semibold">SSO master key required</p>
          <p className="mt-1 text-xs text-amber-100">
            Set <span className="text-amber-50">SSO_MASTER_KEY</span> in your environment to
            save SSO secrets. Generate one with:
          </p>
          <pre className="mt-2 rounded-xl bg-black/30 px-3 py-2 text-xs text-amber-50">
node -e &quot;console.log(require(&apos;crypto&apos;).randomBytes(32).toString(&apos;base64&apos;))&quot;
          </pre>
          <p className="mt-2 text-xs text-amber-100">
            Then restart the app after updating <span className="text-amber-50">.env</span>.
          </p>
        </div>
      ) : null}
      <ProviderCard
        title="Microsoft Entra ID"
        description="Configure Azure AD / Entra ID OpenID Connect settings."
        source={azure?.source}
      >
        {hasMasterKey && azure?.hasSecret && azure?.secretValid === false ? (
          <p className="text-xs text-rose-300">
            Stored client secret could not be decrypted. Re-save it to restore SSO.
          </p>
        ) : null}
        <p className="text-xs text-ink-300">
          Callback URL: <span className="text-ink-100">{azureCallback}</span>
        </p>
        <p className="text-xs text-ink-300">
          Tenant ID only. Do not paste the OpenID discovery URL.
        </p>
        <form action={azureAction} className="space-y-4">
          <input type="hidden" name="provider" value="azure-ad" />
          <label className="flex items-center gap-2 text-sm text-ink-200">
            <input
              type="checkbox"
              name="enabled"
              checked={azureForm.enabled}
              onChange={(event) =>
                setAzureForm((current) => ({ ...current, enabled: event.target.checked }))
              }
              className="h-4 w-4"
            />
            Enable Entra ID
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              name="clientId"
              placeholder="Client ID"
              value={azureForm.clientId}
              onChange={(event) =>
                setAzureForm((current) => ({ ...current, clientId: event.target.value }))
              }
              className="input-surface rounded-2xl px-4 py-2 text-sm text-ink-100"
            />
            <input
              name="tenantId"
              placeholder="Tenant ID"
              value={azureForm.tenantId}
              onChange={(event) =>
                setAzureForm((current) => ({ ...current, tenantId: event.target.value }))
              }
              className="input-surface rounded-2xl px-4 py-2 text-sm text-ink-100"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              name="clientSecret"
              type="password"
              placeholder={azure?.hasSecret ? 'Client secret (saved)' : 'Client secret'}
              value={azureForm.clientSecret}
              onChange={(event) =>
                setAzureForm((current) => ({ ...current, clientSecret: event.target.value }))
              }
              className="input-surface rounded-2xl px-4 py-2 text-sm text-ink-100"
            />
            <label className="flex items-center gap-2 text-xs text-ink-300">
              <input
                type="checkbox"
                name="clearSecret"
                checked={azureForm.clearSecret}
                onChange={(event) =>
                  setAzureForm((current) => ({ ...current, clearSecret: event.target.checked }))
                }
                className="h-4 w-4"
              />
              Clear stored secret
            </label>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              name="intent"
              value="save"
              className="rounded-full bg-ocean-500 px-4 py-2 text-xs font-semibold text-white hover:bg-ocean-400 transition"
            >
              Save settings
            </button>
            <button
              type="submit"
              name="intent"
              value="test"
              className="rounded-full border border-ink-600 px-4 py-2 text-xs font-semibold text-ink-100 hover:border-ink-300 transition"
            >
              Test connection
            </button>
          </div>
          <StatusBadge state={azureState} />
        </form>
      </ProviderCard>

      <ProviderCard
        title="Keycloak"
        description="Configure Keycloak OpenID Connect settings."
        source={keycloak?.source}
      >
        {hasMasterKey && keycloak?.hasSecret && keycloak?.secretValid === false ? (
          <p className="text-xs text-rose-300">
            Stored client secret could not be decrypted. Re-save it to restore SSO.
          </p>
        ) : null}
        <p className="text-xs text-ink-300">
          Callback URL: <span className="text-ink-100">{keycloakCallback}</span>
        </p>
        <p className="text-xs text-ink-300">
          Issuer base URL only (no <span className="text-ink-100">/.well-known/openid-configuration</span>).
        </p>
        <form action={keycloakAction} className="space-y-4">
          <input type="hidden" name="provider" value="keycloak" />
          <label className="flex items-center gap-2 text-sm text-ink-200">
            <input
              type="checkbox"
              name="enabled"
              checked={keycloakForm.enabled}
              onChange={(event) =>
                setKeycloakForm((current) => ({ ...current, enabled: event.target.checked }))
              }
              className="h-4 w-4"
            />
            Enable Keycloak
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              name="clientId"
              placeholder="Client ID"
              value={keycloakForm.clientId}
              onChange={(event) =>
                setKeycloakForm((current) => ({ ...current, clientId: event.target.value }))
              }
              className="input-surface rounded-2xl px-4 py-2 text-sm text-ink-100"
            />
            <input
              name="issuer"
              placeholder="Issuer URL"
              value={keycloakForm.issuer}
              onChange={(event) =>
                setKeycloakForm((current) => ({ ...current, issuer: event.target.value }))
              }
              className="input-surface rounded-2xl px-4 py-2 text-sm text-ink-100"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              name="clientSecret"
              type="password"
              placeholder={keycloak?.hasSecret ? 'Client secret (saved)' : 'Client secret'}
              value={keycloakForm.clientSecret}
              onChange={(event) =>
                setKeycloakForm((current) => ({ ...current, clientSecret: event.target.value }))
              }
              className="input-surface rounded-2xl px-4 py-2 text-sm text-ink-100"
            />
            <label className="flex items-center gap-2 text-xs text-ink-300">
              <input
                type="checkbox"
                name="clearSecret"
                checked={keycloakForm.clearSecret}
                onChange={(event) =>
                  setKeycloakForm((current) => ({ ...current, clearSecret: event.target.checked }))
                }
                className="h-4 w-4"
              />
              Clear stored secret
            </label>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              name="intent"
              value="save"
              className="rounded-full bg-ocean-500 px-4 py-2 text-xs font-semibold text-white hover:bg-ocean-400 transition"
            >
              Save settings
            </button>
            <button
              type="submit"
              name="intent"
              value="test"
              className="rounded-full border border-ink-600 px-4 py-2 text-xs font-semibold text-ink-100 hover:border-ink-300 transition"
            >
              Test connection
            </button>
          </div>
          <StatusBadge state={keycloakState} />
        </form>
      </ProviderCard>

      <ProviderCard
        title="Local Credentials"
        description="Allow local email/password sign-in alongside SSO."
        source={credentials?.source}
      >
        <form action={credentialsAction} className="space-y-4">
          <input type="hidden" name="provider" value="credentials" />
          <label className="flex items-center gap-2 text-sm text-ink-200">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={credentials?.enabled ?? true}
              className="h-4 w-4"
            />
            Enable credentials login
          </label>
          <button
            type="submit"
            name="intent"
            value="save"
            className="rounded-full bg-ocean-500 px-4 py-2 text-xs font-semibold text-white hover:bg-ocean-400 transition"
          >
            Save settings
          </button>
          <StatusBadge state={credentialsState} />
        </form>
      </ProviderCard>
    </div>
  );
}
