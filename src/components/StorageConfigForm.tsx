'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useFormState } from 'react-dom';
import HiddenCsrfInput, { getCsrfTokenFromCookie } from './HiddenCsrfInput';
import { updateStorageConfig } from '@/app/admin/actions';
import SelectField from './SelectField';

export type StorageFormConfig = {
  enabled: boolean;
  bucket?: string | null;
  region?: string | null;
  accessKeyId?: string | null;
  container?: string | null;
  account?: string | null;
  endpoint?: string | null;
  authMode?: 'connection-string' | 'account-key' | null;
  forcePathStyle?: boolean | null;
  hasSecret: boolean;
  secretValid?: boolean | null;
  updatedAt?: string | null;
  source?: 'db' | 'env' | null;
  sasTtlMinutes?: number | null;
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
  if (state.status === 'idle') return null;
  const tone = state.status === 'success' ? 'text-emerald-300' : 'text-rose-300';
  return <p className={`text-xs ${tone}`}>{state.message}</p>;
}

export default function StorageConfigForm({
  activeProvider,
  local,
  s3,
  azure,
  hasMasterKey
}: {
  activeProvider: 'local' | 's3' | 'azure';
  local: StorageFormConfig | null;
  s3: StorageFormConfig | null;
  azure: StorageFormConfig | null;
  hasMasterKey: boolean;
}) {
  const [selectedProvider, setSelectedProvider] = useState(activeProvider);
  const [localState, localAction] = useFormState(updateStorageConfig, initialState);
  const [s3State, s3Action] = useFormState(updateStorageConfig, initialState);
  const [azureState, azureAction] = useFormState(updateStorageConfig, initialState);
  const [sasState, setSasState] = useState<{ status: 'idle' | 'success' | 'error'; message: string }>(initialState);
  const [sasResponse, setSasResponse] = useState<{ uploadUrl: string; blobUrl: string; expiresAt: string } | null>(null);

  const [localForm, setLocalForm] = useState(() => ({
    enabled: local?.enabled ?? selectedProvider === 'local'
  }));

  const [s3Form, setS3Form] = useState(() => ({
    enabled: s3?.enabled ?? selectedProvider === 's3',
    bucket: s3?.bucket ?? '',
    region: s3?.region ?? '',
    endpoint: s3?.endpoint ?? '',
    accessKeyId: s3?.accessKeyId ?? '',
    secretAccessKey: '',
    forcePathStyle: s3?.forcePathStyle ?? false,
    clearSecret: false
  }));

  const [azureForm, setAzureForm] = useState(() => ({
    enabled: azure?.enabled ?? false,
    container: azure?.container ?? '',
    endpoint: azure?.endpoint ?? '',
    authMode: azure?.authMode ?? 'account-key',
    account: azure?.account ?? '',
    connectionString: '',
    accountKey: '',
    clearSecret: false,
    sasTtlMinutes: azure?.sasTtlMinutes ?? null
  }));

  useEffect(() => {
    setSelectedProvider(activeProvider);
  }, [activeProvider]);

  useEffect(() => {
    setLocalForm({
      enabled: local?.enabled ?? selectedProvider === 'local'
    });
  }, [local?.enabled, selectedProvider]);

  useEffect(() => {
    setS3Form({
      enabled: s3?.enabled ?? selectedProvider === 's3',
      bucket: s3?.bucket ?? '',
      region: s3?.region ?? '',
      endpoint: s3?.endpoint ?? '',
      accessKeyId: s3?.accessKeyId ?? '',
      secretAccessKey: '',
      forcePathStyle: s3?.forcePathStyle ?? false,
      clearSecret: false
    });
  }, [s3?.enabled, s3?.bucket, s3?.region, s3?.endpoint, s3?.accessKeyId, s3?.forcePathStyle, selectedProvider]);

  useEffect(() => {
    setAzureForm({
      enabled: azure?.enabled ?? false,
      container: azure?.container ?? '',
      endpoint: azure?.endpoint ?? '',
      authMode: azure?.authMode ?? 'account-key',
      account: azure?.account ?? '',
      connectionString: '',
      accountKey: '',
      clearSecret: false,
      sasTtlMinutes: azure?.sasTtlMinutes ?? null
    });
  }, [azure?.enabled, azure?.container, azure?.endpoint, azure?.authMode, azure?.account, azure?.sasTtlMinutes]);

  async function handleSasRequest() {
    setSasState({ status: 'idle', message: '' });
    setSasResponse(null);
    try {
      const res = await fetch('/api/storage/sas', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': getCsrfTokenFromCookie()
        },
        body: JSON.stringify({ filename: 'icon.png', contentType: 'image/png' })
      });
      const payload = await res.json();
      if (!res.ok) {
        setSasState({ status: 'error', message: payload?.error || 'Failed to create SAS' });
        return;
      }
      setSasResponse({
        uploadUrl: payload.uploadUrl,
        blobUrl: payload.blobUrl,
        expiresAt: payload.expiresAt
      });
      setSasState({ status: 'success', message: 'SAS token generated' });
    } catch (error) {
      setSasState({ status: 'error', message: error instanceof Error ? error.message : 'Failed to create SAS' });
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-ink-800/60 bg-ink-900/30 px-4 py-3 text-xs text-ink-300">
        Upload storage can be managed here for high-availability deployments. Select the active provider and save its settings.
      </div>
      <div className="rounded-2xl border border-ink-800 px-4 py-3">
        <label className="text-xs uppercase tracking-[0.2em] text-ink-400">Active provider</label>
        <div className="mt-2">
          <SelectField
            name="activeProvider"
            defaultValue={selectedProvider}
            options={[
              { value: 'local', label: 'Local filesystem' },
              { value: 's3', label: 'S3 / S3-compatible' },
              { value: 'azure', label: 'Azure Blob Storage' }
            ]}
            onChange={(value) => {
              const next = value as 'local' | 's3' | 'azure';
              setSelectedProvider(next);
              if (next === 'local') {
                setLocalForm((current) => ({ ...current, enabled: true }));
              }
              if (next === 's3') {
                setS3Form((current) => ({ ...current, enabled: true }));
              }
              if (next === 'azure') {
                setAzureForm((current) => ({ ...current, enabled: true }));
              }
            }}
          />
        </div>
        <p className="mt-2 text-xs text-ink-400">
          Pick a provider, update its settings, then save to apply. The selected provider will be enabled and others disabled.
        </p>
      </div>
      {!hasMasterKey ? (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <p className="font-semibold">SSO master key required</p>
          <p className="mt-1 text-xs text-amber-100">
            Set <span className="text-amber-50">SSO_MASTER_KEY</span> in your environment to
            save encrypted storage secrets.
          </p>
        </div>
      ) : null}
      {selectedProvider === 'local' ? (
        <ProviderCard
          title="Local filesystem"
          description="Store uploads inside the container filesystem (best for single-host dev)."
          source={local?.source}
        >
          <form action={localAction} className="space-y-4">
            <HiddenCsrfInput />
            <input type="hidden" name="provider" value="local" />
            <label className="flex items-center gap-2 text-sm text-ink-200">
              <input
                type="checkbox"
                name="enabled"
                checked={localForm.enabled}
                onChange={(event) =>
                  setLocalForm((current) => ({ ...current, enabled: event.target.checked }))
                }
                className="h-4 w-4"
              />
              Enable local uploads
            </label>
            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                name="intent"
                value="save"
                className="rounded-full bg-ocean-500 px-4 py-2 text-xs font-semibold text-white hover:bg-ocean-400 transition"
              >
                Save settings
              </button>
            </div>
            <StatusBadge state={localState} />
          </form>
        </ProviderCard>
      ) : null}

      {selectedProvider === 's3' ? (
        <ProviderCard
          title="S3 / S3-compatible"
          description="Use AWS S3 or an S3-compatible storage provider for uploads."
          source={s3?.source}
        >
          {hasMasterKey && s3?.hasSecret && s3?.secretValid === false ? (
            <p className="text-xs text-rose-300">
              Stored S3 secret could not be decrypted. Re-save it to restore storage access.
            </p>
          ) : null}
          <form action={s3Action} className="space-y-4">
            <HiddenCsrfInput />
            <input type="hidden" name="provider" value="s3" />
            <label className="flex items-center gap-2 text-sm text-ink-200">
              <input
                type="checkbox"
                name="enabled"
                checked={s3Form.enabled}
                onChange={(event) =>
                  setS3Form((current) => ({ ...current, enabled: event.target.checked }))
                }
                className="h-4 w-4"
              />
              Enable S3 uploads
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                name="bucket"
                placeholder="Bucket"
                value={s3Form.bucket}
                onChange={(event) => setS3Form((current) => ({ ...current, bucket: event.target.value }))}
                className="input-surface rounded-2xl px-4 py-2 text-sm text-ink-100"
              />
              <input
                name="region"
                placeholder="Region"
                value={s3Form.region}
                onChange={(event) => setS3Form((current) => ({ ...current, region: event.target.value }))}
                className="input-surface rounded-2xl px-4 py-2 text-sm text-ink-100"
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                name="endpoint"
                placeholder="Endpoint (optional)"
                value={s3Form.endpoint}
                onChange={(event) => setS3Form((current) => ({ ...current, endpoint: event.target.value }))}
                className="input-surface rounded-2xl px-4 py-2 text-sm text-ink-100"
              />
              <input
                name="accessKeyId"
                placeholder="Access key ID"
                value={s3Form.accessKeyId}
                onChange={(event) => setS3Form((current) => ({ ...current, accessKeyId: event.target.value }))}
                className="input-surface rounded-2xl px-4 py-2 text-sm text-ink-100"
              />
            </div>
            <input
              name="secretAccessKey"
              type="password"
              placeholder={s3?.hasSecret ? 'Secret access key (saved)' : 'Secret access key'}
              value={s3Form.secretAccessKey}
              onChange={(event) => setS3Form((current) => ({ ...current, secretAccessKey: event.target.value }))}
              className="input-surface rounded-2xl px-4 py-2 text-sm text-ink-100"
            />
            <label className="flex items-center gap-2 text-xs text-ink-300">
              <input
                type="checkbox"
                name="forcePathStyle"
                checked={s3Form.forcePathStyle}
                onChange={(event) => setS3Form((current) => ({ ...current, forcePathStyle: event.target.checked }))}
                className="h-4 w-4"
              />
              Force path-style URLs (S3-compatible)
            </label>
            <label className="flex items-center gap-2 text-xs text-ink-300">
              <input
                type="checkbox"
                name="clearSecret"
                checked={s3Form.clearSecret}
                onChange={(event) => setS3Form((current) => ({ ...current, clearSecret: event.target.checked }))}
                className="h-4 w-4"
              />
              Clear stored secret
            </label>
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
            <StatusBadge state={s3State} />
          </form>
        </ProviderCard>
      ) : null}

      {selectedProvider === 'azure' ? (
        <ProviderCard
          title="Azure Blob Storage"
          description="Manage Azure Blob credentials, container settings, and SAS token generation."
          source={azure?.source}
        >
          {hasMasterKey && azure?.hasSecret && azure?.secretValid === false ? (
            <p className="text-xs text-rose-300">
              Stored Azure secret could not be decrypted. Re-save it to restore storage access.
            </p>
          ) : null}
          <form action={azureAction} className="space-y-4">
            <HiddenCsrfInput />
            <input type="hidden" name="provider" value="azure" />
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
              Enable Azure Blob uploads
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <SelectField
                name="authMode"
                defaultValue={azureForm.authMode}
                options={[
                  { value: 'connection-string', label: 'Connection string' },
                  { value: 'account-key', label: 'Account name + key' }
                ]}
                onChange={(value) =>
                  setAzureForm((current) => ({
                    ...current,
                    authMode: value as 'connection-string' | 'account-key'
                  }))
                }
              />
              <input
                name="container"
                placeholder="Container (e.g. uploads)"
                value={azureForm.container}
                onChange={(event) => setAzureForm((current) => ({ ...current, container: event.target.value }))}
                className="input-surface rounded-2xl px-4 py-2 text-sm text-ink-100"
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                name="endpoint"
                placeholder="Endpoint (optional)"
                value={azureForm.endpoint}
                onChange={(event) => setAzureForm((current) => ({ ...current, endpoint: event.target.value }))}
                className="input-surface rounded-2xl px-4 py-2 text-sm text-ink-100"
              />
              <input
                name="sasTtlMinutes"
                type="number"
                min={1}
                placeholder="SAS TTL (minutes)"
                value={azureForm.sasTtlMinutes ?? ''}
                onChange={(event) =>
                  setAzureForm((current) => ({
                    ...current,
                    sasTtlMinutes: event.target.value ? Number(event.target.value) : null
                  }))
                }
                className="input-surface rounded-2xl px-4 py-2 text-sm text-ink-100"
              />
            </div>
            {azureForm.authMode === 'connection-string' ? (
              <input
                name="connectionString"
                type="password"
                placeholder={azure?.hasSecret ? 'Connection string (saved)' : 'Connection string'}
                value={azureForm.connectionString}
                onChange={(event) => setAzureForm((current) => ({ ...current, connectionString: event.target.value }))}
                className="input-surface rounded-2xl px-4 py-2 text-sm text-ink-100"
              />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  name="account"
                  placeholder="Storage account"
                  value={azureForm.account}
                  onChange={(event) => setAzureForm((current) => ({ ...current, account: event.target.value }))}
                  className="input-surface rounded-2xl px-4 py-2 text-sm text-ink-100"
                />
                <input
                  name="accountKey"
                  type="password"
                  placeholder={azure?.hasSecret ? 'Account key (saved)' : 'Account key'}
                  value={azureForm.accountKey}
                  onChange={(event) => setAzureForm((current) => ({ ...current, accountKey: event.target.value }))}
                  className="input-surface rounded-2xl px-4 py-2 text-sm text-ink-100"
                />
              </div>
            )}
            <label className="flex items-center gap-2 text-xs text-ink-300">
              <input
                type="checkbox"
                name="clearSecret"
                checked={azureForm.clearSecret}
                onChange={(event) => setAzureForm((current) => ({ ...current, clearSecret: event.target.checked }))}
                className="h-4 w-4"
              />
              Clear stored secret
            </label>
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
              <button
                type="button"
                onClick={handleSasRequest}
                className="rounded-full border border-ink-600 px-4 py-2 text-xs font-semibold text-ink-100 hover:border-ink-300 transition"
              >
                Generate SAS token
              </button>
            </div>
            <StatusBadge state={azureState} />
            <StatusBadge state={sasState} />
            {sasResponse ? (
              <div className="rounded-2xl border border-ink-800 bg-black/20 p-3 text-xs text-ink-200">
                <p className="text-ink-300">Upload URL</p>
                <p className="break-all text-ink-100 mt-1">{sasResponse.uploadUrl}</p>
                <p className="text-ink-300 mt-3">Blob URL</p>
                <p className="break-all text-ink-100 mt-1">{sasResponse.blobUrl}</p>
                <p className="text-ink-300 mt-3">Expires</p>
                <p className="text-ink-100 mt-1">{sasResponse.expiresAt}</p>
              </div>
            ) : null}
          </form>
        </ProviderCard>
      ) : null}
    </div>
  );
}
