'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { Upload, X } from 'lucide-react';
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
  const [fileName, setFileName] = useState<string | null>(null);
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
                setFileName(null);
                setPreviewUrl(null);
              } else if (result && result.status === 'error') {
                setStatusMessage(result.message ?? 'Unable to create app.');
                setStatusTone('error');
              } else {
                setStatusMessage('App created.');
                setStatusTone('success');
                setFileName(null);
                setPreviewUrl(null);
              }
            } catch {
              setStatusMessage('Unable to create app.');
              setStatusTone('error');
            }
          })();
        });
      }}
      encType="multipart/form-data"
      className="grid gap-4 md:grid-cols-2 w-full"
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
      <div className="md:col-span-2 space-y-2">
        <label className="text-xs uppercase tracking-[0.2em] text-ink-400">App icon</label>
        <div className="relative group">
          <input
            type="file"
            name="icon"
            id="icon-upload-new"
            accept="image/png,image/jpeg"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) {
                setPreviewUrl(null);
                setFileName(null);
                return;
              }
              setFileName(file.name);
              if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
              }
              setPreviewUrl(URL.createObjectURL(file));
            }}
            className="sr-only"
          />
          <label
            htmlFor="icon-upload-new"
            className="file-upload-zone"
          >
            <Upload className="file-upload-icon text-ink-400 group-hover:text-ocean-400 transition-colors" />
            <div className="text-center">
              <p className="file-upload-title">
                {fileName ? fileName : 'Click to upload icon'}
              </p>
              <p className="file-upload-description">
                PNG or JPEG (max 2MB)
              </p>
            </div>
            {fileName && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setFileName(null);
                  setPreviewUrl(null);
                  const input = document.getElementById('icon-upload-new') as HTMLInputElement;
                  if (input) input.value = '';
                }}
                className="absolute top-4 right-4 p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-ink-400 hover:text-white transition-all shadow-sm"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
        </div>
        {safePreviewUrl ? (
          <div className="mt-4 p-4 rounded-3xl bg-white/5 border border-white/5 flex items-center gap-4 animate-in fade-in slide-in-from-top-2">
            <div className="h-12 w-12 rounded-2xl bg-white/10 flex items-center justify-center p-2 shadow-inner">
              <img src={safePreviewUrl} alt="" className="h-full w-full object-contain" />
            </div>
            <div>
              <p className="text-sm font-medium text-ink-100">Preview</p>
              <p className="text-xs text-ink-400">This is how the icon will appear</p>
            </div>
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
              ? 'text-emerald-600 dark:text-emerald-300 text-xs md:col-span-2 font-medium'
              : 'text-rose-600 dark:text-rose-300 text-xs md:col-span-2 font-medium'
          }
        >
          {statusMessage}
        </p>
      ) : null}
    </form>
  );
}
