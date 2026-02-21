'use client';

import { useEffect, useState, useTransition } from 'react';
import SelectField, { SelectOption } from './SelectField';

interface NewAppFormProps {
  categorySelectOptions: SelectOption[];
  audienceOptions: SelectOption[];
  roleOptions: SelectOption[];
  action: (formData: FormData) => void | Promise<void>;
}

export default function NewAppForm({
  categorySelectOptions,
  audienceOptions,
  roleOptions,
  action
}: NewAppFormProps) {
  const [isPending, startTransition] = useTransition();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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
      <SelectField name="audience" options={audienceOptions} defaultValue="AUTHENTICATED" />
      <SelectField
        name="roleId"
        options={roleOptions}
        defaultValue=""
        className="md:col-span-2"
      />
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
          accept="image/*"
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
        {previewUrl ? (
          <div className="mt-3 flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-white/10 flex items-center justify-center">
              <img src={previewUrl} alt="" className="h-8 w-8 object-contain" />
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
    </form>
  );
}
