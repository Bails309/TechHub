"use client";

import { useFormState } from 'react-dom';
import { useState } from 'react';
import SelectField from './SelectField';
import type { LinkSsoAccountState } from '@/app/admin/actions';
import HiddenCsrfInput from './HiddenCsrfInput';

const initialState: LinkSsoAccountState = { status: 'idle', message: '' };

type LinkSsoAccountFormProps = {
  linkSsoAccount: (
    prevState: LinkSsoAccountState,
    formData: FormData
  ) => Promise<LinkSsoAccountState>;
};

export default function LinkSsoAccountForm({ linkSsoAccount }: LinkSsoAccountFormProps) {
  const [state, formAction] = useFormState(linkSsoAccount, initialState);
  const [tokenValue, setTokenValue] = useState('');
  const [tokenMessage, setTokenMessage] = useState('');

  const decodeJwtPayload = (token: string) => {
    const parts = token.split('.');
    if (parts.length < 2) {
      return null;
    }
    const payload = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=');
    try {
      const binary = atob(payload);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const json = new TextDecoder().decode(bytes);
      return JSON.parse(json) as { sub?: string };
    } catch {
      return null;
    }
  };

  const handleExtractSub = () => {
    const rawValue = tokenValue.trim();
    if (rawValue && !rawValue.includes('.')) {
      const field = document.querySelector<HTMLInputElement>('input[name="providerAccountId"]');
      if (field) {
        field.value = rawValue;
      }
      setTokenMessage('Copied value into Provider account ID.');
      return;
    }

    const payload = decodeJwtPayload(rawValue);
    if (!payload?.sub) {
      setTokenMessage('Unable to extract sub from token.');
      return;
    }

    const field = document.querySelector<HTMLInputElement>('input[name="providerAccountId"]');
    if (field) {
      field.value = payload.sub;
    }
    setTokenMessage('Extracted sub into Provider account ID.');
  };

  return (
    <form action={formAction} className="grid gap-3 md:grid-cols-2">
      <HiddenCsrfInput />
      <input
        name="email"
        placeholder="User email"
        type="email"
        required
        className="input-surface rounded-full px-4 py-2 text-sm text-ink-100"
      />
      <div>
        <SelectField
          name="provider"
          options={[
            { value: '', label: 'Select provider' },
            { value: 'azure-ad', label: 'Microsoft Entra ID' },
            { value: 'keycloak', label: 'Keycloak' }
          ]}
          defaultValue={''}
        />
      </div>
      <div className="md:col-span-2 space-y-2">
        <label className="text-xs uppercase tracking-[0.2em] text-ink-400">
          Provider account ID (sub)
        </label>
        <p className="text-xs text-ink-300">
          Use the user ID from your provider (Keycloak user ID or Entra ID Object ID).
        </p>
        <input
          name="providerAccountId"
          placeholder="e.g. a7609e88-10e5-4304-bf31-4787d5060511"
          required
          className="input-surface w-full rounded-full px-4 py-2 text-sm text-ink-100"
        />
      </div>
      <div className="md:col-span-2 space-y-2">
        <label className="text-xs uppercase tracking-[0.2em] text-ink-400">
          Optional: paste JWT ID token to extract sub
        </label>
        <p className="text-xs text-ink-300">
          Keycloak: Admin Console &gt; Users &gt; select user &gt; copy ID.
          <br />
          Entra ID: Users &gt; select user &gt; Object ID.
        </p>
        <textarea
          value={tokenValue}
          onChange={(event) => setTokenValue(event.target.value)}
          placeholder="Paste JWT ID token here"
          className="input-surface w-full rounded-2xl px-4 py-3 text-xs text-ink-100"
          rows={3}
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExtractSub}
            className="rounded-full border border-ink-600 px-4 py-2 text-xs font-semibold text-ink-100 hover:border-ink-300 transition"
          >
            Extract sub
          </button>
          {tokenMessage ? <span className="text-xs text-ink-300">{tokenMessage}</span> : null}
        </div>
      </div>
      <button
        type="submit"
        className="md:col-span-2 rounded-full bg-ocean-500 px-4 py-2 text-xs font-semibold text-white hover:bg-ocean-400 transition"
      >
        Link SSO account
      </button>
      {state.status !== 'idle' ? (
        <p
          className={
            state.status === 'success'
              ? 'text-emerald-600 dark:text-emerald-300 text-xs md:col-span-2 font-medium'
              : 'text-rose-600 dark:text-rose-300 text-xs md:col-span-2 font-medium'
          }
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
