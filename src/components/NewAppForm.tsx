'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import SelectField, { SelectOption } from './SelectField';

interface NewAppFormProps {
  categorySelectOptions: SelectOption[];
  audienceOptions: SelectOption[];
  roleOptions: SelectOption[];
  userOptions: SelectOption[];
  action: (formData: FormData) => void | Promise<{ status: 'success' | 'error'; message: string }>;
}

export default function NewAppForm({
  categorySelectOptions,
  audienceOptions,
  roleOptions,
  userOptions,
  action
}: NewAppFormProps) {
  const [isPending, startTransition] = useTransition();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<'success' | 'error' | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [audience, setAudience] = useState('AUTHENTICATED');
  const safePreviewUrl = useMemo(() => {
    if (!previewUrl) {
      return null;
    }
    try {
      if (previewUrl.startsWith('blob:')) {
        return previewUrl;
      }
      const url = new URL(previewUrl, window.location.origin);
      if (url.origin !== window.location.origin) {
        return null;
      }
      if (!url.pathname.startsWith('/uploads/')) {
        return null;
      }
      return url.toString();
    } catch {
      return null;
    }
  }, [previewUrl]);

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
      <input
        name="name"
        placeholder="App name"
        required
        className="rounded-2xl border border-ink-700 bg-transparent px-4 py-3"
      />
      <input
        name="url"
        placeholder="https://"
        required
        className="rounded-2xl border border-ink-700 bg-transparent px-4 py-3"
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
          className="input-surface w-full rounded-full px-5 py-3 text-ink-100 shadow-glow/30 focus:outline-none focus:ring-2 focus:ring-ocean-400/60"
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
        <div className="md:col-span-2 space-y-2">
          <label className="text-xs uppercase tracking-[0.2em] text-ink-400">
            Assign users (for specific user apps)
          </label>
          <div className="grid gap-2 md:grid-cols-2">
            {userOptions.map((option) => (
              <label key={option.value} className="flex items-center gap-2 text-xs text-ink-200">
                <input type="checkbox" name="userIds" value={option.value} className="h-4 w-4" />
                {option.label}
              </label>
            ))}
          </div>
        </div>
      ) : null}
      <textarea
        name="description"
        placeholder="Short description"
        className="rounded-2xl border border-ink-700 bg-transparent px-4 py-3 md:col-span-2"
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
          className="input-surface mt-2 w-full rounded-full px-4 py-2 text-xs text-ink-100"
        />
        {safePreviewUrl ? (
          <div className="mt-3 flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-white/10 flex items-center justify-center">
              {/* codeql[js/xss-through-dom] preview URL is constrained to same-origin uploads or blob */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={safePreviewUrl} alt="" className="h-8 w-8 object-contain" />
            </div>
            <p className="text-xs text-ink-300">Icon preview</p>
          </div>
        ) : null}
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="md:col-span-2 rounded-full bg-ocean-500 px-5 py-3 text-sm font-semibold text-white hover:bg-ocean-400 transition disabled:opacity-60"
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
