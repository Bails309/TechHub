'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import SelectField, { SelectOption } from './SelectField';
import HiddenCsrfInput, { getCsrfTokenFromCookie } from './HiddenCsrfInput';
import { sanitizeIconUrl } from '../lib/sanitizeIconUrl';
import UserAutocomplete from './UserAutocomplete';

interface NewAppFormProps {
  categorySelectOptions: SelectOption[];
  audienceOptions: SelectOption[];
  roleOptions: SelectOption[];
  action: (formData: FormData) => void | Promise<{ status: 'success' | 'error'; message: string }>;
}

export default function NewAppForm({
  categorySelectOptions,
  audienceOptions,
  roleOptions,
  action
}: NewAppFormProps) {
  const [isPending, startTransition] = useTransition();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<'success' | 'error' | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [audience, setAudience] = useState('AUTHENTICATED');
  const safePreviewUrl = useMemo(() => sanitizeIconUrl(previewUrl), [previewUrl]);

  const handleAudienceChange = (value: string) => {
    if (value === 'PUBLIC' || value === 'AUTHENTICATED' || value === 'ROLE' || value === 'USER') {
      setAudience(value);
    }
  };

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  return (
    <form
      action={(formData) => {
        formData.set('csrfToken', getCsrfTokenFromCookie());
        setStatusMessage(null);
        setStatusTone(null);
        startTransition(() => {
          void (async () => {
            try {
              const result = await action(formData);
              if (result && result.status === 'success') {
                setStatusMessage(result.message ?? 'App created.');
                setStatusTone('success');
              } else if (result && result.status === 'error') {
                setStatusMessage(result.message ?? 'Unable to create app.');
                setStatusTone('error');
              } else {
                setStatusMessage('App created.');
                setStatusTone('success');
              }
            } catch {
              setStatusMessage('Unable to create app.');
              setStatusTone('error');
            }
          })();
        });
      }}
      encType="multipart/form-data"
      className="grid gap-4 md:grid-cols-2"
    >
      <HiddenCsrfInput />
      <input
        name="name"
        placeholder="App name"
        required
        className="input-field"
      />
      <input
        name="url"
        placeholder="https://"
        required
        className="input-field"
      />
      <div className="space-y-2">
        <label className="text-xs uppercase tracking-[0.2em] text-ink-400">Category</label>
        <SelectField name="categorySelect" options={categorySelectOptions} defaultValue="none" />
      </div>
      <div className="space-y-2">
        <label className="text-xs uppercase tracking-[0.2em] text-ink-400">
          New category
        </label>
        <input
          name="categoryNew"
          placeholder="Type a new category"
          className="input-field"
        />
      </div>
      <SelectField
        name="audience"
        options={audienceOptions}
        defaultValue="AUTHENTICATED"
        onChange={handleAudienceChange}
      />
      <SelectField
        name="roleId"
        options={roleOptions}
        defaultValue=""
        className="md:col-span-2"
      />
      {audience === 'USER' ? (
        <UserAutocomplete />
      ) : null}
      <textarea
        name="description"
        placeholder="Short description"
        className="input-field md:col-span-2"
        rows={3}
      />
      <div className="md:col-span-2">
        <label className="text-xs uppercase tracking-[0.2em] text-ink-400">App icon</label>
        <input
          type="file"
          name="icon"
          accept="image/png,image/jpeg"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) {
              setPreviewUrl(null);
              return;
            }
            if (previewUrl) {
              URL.revokeObjectURL(previewUrl);
            }
            setPreviewUrl(URL.createObjectURL(file));
          }}
          className="input-field mt-2 py-2 text-xs"
        />
        {safePreviewUrl ? (
          <div className="mt-3 flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-white/10 flex items-center justify-center">
              {/* codeql[js/xss-through-dom] preview URL is constrained to same-origin uploads or blob */}
              <img src={safePreviewUrl} alt="" className="h-8 w-8 object-contain" />
            </div>
            <p className="text-xs text-ink-300">Icon preview</p>
          </div>
        ) : null}
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="btn-primary md:col-span-2 disabled:opacity-60"
      >
        {isPending ? 'Creating…' : 'Create app'}
      </button>
      {statusMessage ? (
        <p
          className={
            statusTone === 'success'
              ? 'text-emerald-300 text-xs md:col-span-2'
              : 'text-rose-300 text-xs md:col-span-2'
          }
        >
          {statusMessage}
        </p>
      ) : null}
    </form>
  );
}
