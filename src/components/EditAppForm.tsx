'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { Upload, X } from 'lucide-react';
import SelectField, { SelectOption } from './SelectField';
import HiddenCsrfInput, { getCsrfTokenFromCookie } from './HiddenCsrfInput';
import { sanitizeIconUrl } from '../lib/sanitizeIconUrl';
import UserAutocomplete, { UserOption } from './UserAutocomplete';

interface EditAppFormProps {
  app: {
    id: string;
    name: string;
    url: string;
    description: string | null;
    audience: 'PUBLIC' | 'AUTHENTICATED' | 'ROLE' | 'USER';
    roleId: string | null;
    categoryId: string | null;
    icon?: string | null;
  };
  categoryOptions: SelectOption[];
  audienceOptions: SelectOption[];
  roleOptions: SelectOption[];
  initialUsers: UserOption[];
  action: (formData: FormData) => void | Promise<void | { status: 'idle' | 'success' | 'error'; message: string }>;
}

export default function EditAppForm({
  app,
  categoryOptions,
  audienceOptions,
  roleOptions,
  initialUsers,
  action
}: EditAppFormProps) {
  const [isPending, startTransition] = useTransition();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<'success' | 'error' | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [audience, setAudience] = useState(app.audience);

  const handleAudienceChange = (value: string) => {
    if (value === 'PUBLIC' || value === 'AUTHENTICATED' || value === 'ROLE' || value === 'USER') {
      setAudience(value);
    }
  };

  const existingIcon = app.icon ?? null;
  const displayIcon = useMemo(() => previewUrl ?? existingIcon, [existingIcon, previewUrl]);
  const safeDisplayIcon = useMemo(() => sanitizeIconUrl(displayIcon), [displayIcon]);

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
        let hasLargeFile = false;
        for (const [, value] of formData.entries()) {
          if (typeof window !== 'undefined' && value instanceof File && value.size > 2 * 1024 * 1024) {
            hasLargeFile = true;
            break;
          }
        }
        if (hasLargeFile) {
          setStatusMessage('File too large (maximum 2MB)');
          setStatusTone('error');
          return;
        }

        formData.set('csrfToken', getCsrfTokenFromCookie());
        setStatusMessage(null);
        setStatusTone(null);
        startTransition(() => {
          void (async () => {
            try {
              const result = await action(formData);
              if (result && result.status === 'success') {
                setStatusMessage(result.message ?? 'Changes saved.');
                setStatusTone('success');
                setFileName(null);
              } else if (result && result.status === 'error') {
                setStatusMessage(result.message ?? 'Unable to save changes.');
                setStatusTone('error');
              } else {
                setStatusMessage('Changes saved.');
                setStatusTone('success');
                setFileName(null);
              }
            } catch {
              setStatusMessage('Unable to save changes.');
              setStatusTone('error');
            }
          })();
        });
      }}
      encType="multipart/form-data"
      className="grid gap-3 md:grid-cols-2 w-full"
    >
      <HiddenCsrfInput />
      <input type="hidden" name="id" value={app.id} />
      <input
        name="name"
        defaultValue={app.name}
        required
        className="input-field"
      />
      <input
        name="url"
        defaultValue={app.url}
        required
        className="input-field"
      />
      <SelectField
        name="categoryId"
        options={categoryOptions}
        defaultValue={app.categoryId ?? ''}
        className="md:col-span-2"
      />
      <SelectField
        name="audience"
        options={audienceOptions}
        defaultValue={app.audience}
        onChange={handleAudienceChange}
      />
      <SelectField name="roleId" options={roleOptions} defaultValue={app.roleId ?? ''} />
      {audience === 'USER' ? (
        <UserAutocomplete initialSelectedUsers={initialUsers} />
      ) : null}
      <textarea
        name="description"
        defaultValue={app.description ?? ''}
        className="input-field md:col-span-2"
        rows={2}
      />
      <div className="md:col-span-2 space-y-2">
        <label className="text-xs uppercase tracking-[0.2em] text-ink-400">App icon</label>
        <div className="relative group">
          <input
            type="file"
            name="icon"
            id={`icon-upload-${app.id}`}
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
            htmlFor={`icon-upload-${app.id}`}
            className="file-upload-zone"
          >
            <Upload className="file-upload-icon text-ink-400 group-hover:text-ocean-400 transition-colors" />
            <div className="text-center">
              <p className="file-upload-title">
                {fileName ? fileName : 'Click to change icon'}
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
                  const input = document.getElementById(`icon-upload-${app.id}`) as HTMLInputElement;
                  if (input) input.value = '';
                }}
                className="absolute top-4 right-4 p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-ink-400 hover:text-white transition-all shadow-sm"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
        </div>

        {safeDisplayIcon ? (
          <div className="mt-4 p-4 rounded-3xl bg-white/5 border border-white/5 flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-white/10 flex items-center justify-center p-2 shadow-inner">
                <img src={safeDisplayIcon} alt="" className="h-full w-full object-contain" />
              </div>
              <div>
                <p className="text-sm font-medium text-ink-100">
                  {previewUrl ? 'New Icon Preview' : 'Current Icon'}
                </p>
                <p className="text-xs text-ink-400">
                  {previewUrl ? 'Save changes to update' : 'Existing app icon'}
                </p>
              </div>
            </div>
            {!previewUrl && (
              <label className="flex items-center gap-2 text-xs text-ink-200 cursor-pointer hover:text-white transition-colors">
                <input type="checkbox" name="iconRemove" className="h-4 w-4 rounded border-white/10 bg-white/5 text-ocean-500 focus:ring-ocean-500" />
                Remove icon
              </label>
            )}
          </div>
        ) : null}
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="btn-primary md:col-span-2 disabled:opacity-60"
      >
        {isPending ? 'Saving…' : 'Save changes'}
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
