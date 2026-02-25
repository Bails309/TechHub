'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import SelectField, { SelectOption } from './SelectField';
import HiddenCsrfInput, { getCsrfTokenFromCookie } from './HiddenCsrfInput';

interface EditAppFormProps {
  app: {
    id: string;
    name: string;
    url: string;
    category: string | null;
    description: string | null;
    audience: 'PUBLIC' | 'AUTHENTICATED' | 'ROLE' | 'USER';
    roleId: string | null;
    icon?: string | null;
  };
  categorySelectOptions: SelectOption[];
  audienceOptions: SelectOption[];
  roleOptions: SelectOption[];
  userOptions: SelectOption[];
  assignedUserIds: string[];
  action: (formData: FormData) => void | Promise<void | { status: 'idle' | 'success' | 'error'; message: string }>;
}

export default function EditAppForm({
  app,
  categorySelectOptions,
  audienceOptions,
  roleOptions,
  userOptions,
  assignedUserIds,
  action
}: EditAppFormProps) {
  const [isPending, startTransition] = useTransition();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<'success' | 'error' | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [audience, setAudience] = useState(app.audience);

  const handleAudienceChange = (value: string) => {
    if (value === 'PUBLIC' || value === 'AUTHENTICATED' || value === 'ROLE' || value === 'USER') {
      setAudience(value);
    }
  };

  const existingIcon = app.icon ?? null;
  const displayIcon = useMemo(() => previewUrl ?? existingIcon, [existingIcon, previewUrl]);
  const safeDisplayIcon = useMemo(() => {
    if (!displayIcon) {
      return null;
    }
    try {
      if (displayIcon.startsWith('blob:')) {
        return displayIcon;
      }
      const url = new URL(displayIcon, window.location.origin);
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
  }, [displayIcon]);

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
                setStatusMessage(result.message ?? 'Changes saved.');
                setStatusTone('success');
              } else if (result && result.status === 'error') {
                setStatusMessage(result.message ?? 'Unable to save changes.');
                setStatusTone('error');
              } else {
                setStatusMessage('Changes saved.');
                setStatusTone('success');
              }
            } catch {
              setStatusMessage('Unable to save changes.');
              setStatusTone('error');
            }
          })();
        });
      }}
      encType="multipart/form-data"
      className="grid gap-3 md:grid-cols-2"
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
        name="categorySelect"
        options={categorySelectOptions}
        defaultValue={app.category ?? 'none'}
      />
      <input
        name="categoryNew"
        placeholder="New category"
        className="input-field"
      />
      <SelectField
        name="audience"
        options={audienceOptions}
        defaultValue={app.audience}
        onChange={handleAudienceChange}
      />
      <SelectField name="roleId" options={roleOptions} defaultValue={app.roleId ?? ''} />
      {audience === 'USER' ? (
        <div className="md:col-span-2 space-y-2">
          <label className="text-xs uppercase tracking-[0.2em] text-ink-400">
            Assign users (for specific user apps)
          </label>
          <div className="grid gap-2 md:grid-cols-2">
            {userOptions.map((option) => (
              <label key={option.value} className="flex items-center gap-2 text-xs text-ink-200">
                <input
                  type="checkbox"
                  name="userIds"
                  value={option.value}
                  defaultChecked={assignedUserIds.includes(option.value)}
                  className="h-4 w-4"
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>
      ) : null}
      <textarea
        name="description"
        defaultValue={app.description ?? ''}
        className="input-field md:col-span-2"
        rows={2}
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
        {safeDisplayIcon ? (
          <div className="mt-3 flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-white/10 flex items-center justify-center">
              {/* codeql[js/xss-through-dom] preview URL is constrained to same-origin uploads or blob */}
              <img src={safeDisplayIcon} alt="" className="h-8 w-8 object-contain" />
            </div>
            <p className="text-xs text-ink-300">Icon preview</p>
          </div>
        ) : null}
        <label className="mt-3 flex items-center gap-2 text-xs text-ink-200">
          <input type="checkbox" name="iconRemove" className="h-4 w-4" />
          Remove icon (use default)
        </label>
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
