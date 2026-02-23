'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import SelectField, { SelectOption } from './SelectField';

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
  action: (formData: FormData) => void | Promise<void>;
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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [audience, setAudience] = useState(app.audience);

  const handleAudienceChange = (value: string) => {
    if (value === 'PUBLIC' || value === 'AUTHENTICATED' || value === 'ROLE' || value === 'USER') {
      setAudience(value);
    }
  };

  const existingIcon = app.icon ?? null;
  const displayIcon = useMemo(() => previewUrl ?? existingIcon, [existingIcon, previewUrl]);

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
        startTransition(() => {
          void action(formData);
        });
      }}
      encType="multipart/form-data"
      className="grid gap-3 md:grid-cols-2"
    >
      <input type="hidden" name="id" value={app.id} />
      <input
        name="name"
        defaultValue={app.name}
        required
        className="input-surface rounded-full px-4 py-2 text-sm text-ink-100"
      />
      <input
        name="url"
        defaultValue={app.url}
        required
        className="input-surface rounded-full px-4 py-2 text-sm text-ink-100"
      />
      <SelectField
        name="categorySelect"
        options={categorySelectOptions}
        defaultValue={app.category ?? 'none'}
      />
      <input
        name="categoryNew"
        placeholder="New category"
        className="input-surface rounded-full px-4 py-2 text-sm text-ink-100"
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
        className="input-surface rounded-2xl px-4 py-3 text-sm text-ink-100 md:col-span-2"
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
          className="input-surface mt-2 w-full rounded-full px-4 py-2 text-xs text-ink-100"
        />
        {displayIcon ? (
          <div className="mt-3 flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-white/10 flex items-center justify-center">
              <img src={displayIcon} alt="" className="h-8 w-8 object-contain" />
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
        className="md:col-span-2 rounded-full bg-ocean-500 px-4 py-2 text-xs font-semibold text-white hover:bg-ocean-400 transition disabled:opacity-60"
      >
        {isPending ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  );
}
