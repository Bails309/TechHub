'use client';

import { useRef, useState, useTransition } from 'react';
import HiddenCsrfInput from '@/components/HiddenCsrfInput';
import { createPersonalApp, updatePersonalApp, deletePersonalApp } from '@/app/profile/personalAppActions';
import { Plus, Pencil, Trash2, Globe, X, ExternalLink, LayoutGrid, Loader2 } from 'lucide-react';

interface PersonalAppData {
    id: string;
    name: string;
    url: string;
    description?: string | null;
    icon?: string | null;
}

interface PersonalAppManagerProps {
    apps: PersonalAppData[];
    maxApps?: number;
}

export default function PersonalAppManager({ apps: initialApps, maxApps = 25 }: PersonalAppManagerProps) {
    const [showForm, setShowForm] = useState(false);
    const [editingApp, setEditingApp] = useState<PersonalAppData | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [iconError, setIconError] = useState<Record<string, boolean>>({});
    const formRef = useRef<HTMLFormElement>(null);

    // Use useTransition for reliable pending state + success detection
    const [isCreating, startCreate] = useTransition();
    const [isUpdating, startUpdate] = useTransition();
    const [isDeleting, startDelete] = useTransition();

    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    function handleCreate(formData: FormData) {
        setFeedback(null);
        startCreate(async () => {
            const result = await createPersonalApp(null, formData);
            if (result.status === 'success') {
                setShowForm(false);
                formRef.current?.reset();
                setFeedback({ type: 'success', message: 'App created successfully' });
                setTimeout(() => setFeedback(null), 3000);
            } else {
                setFeedback({ type: 'error', message: result.message });
            }
        });
    }

    function handleUpdate(formData: FormData) {
        setFeedback(null);
        startUpdate(async () => {
            const result = await updatePersonalApp(null, formData);
            if (result.status === 'success') {
                setEditingApp(null);
                setFeedback({ type: 'success', message: 'App updated successfully' });
                setTimeout(() => setFeedback(null), 3000);
            } else {
                setFeedback({ type: 'error', message: result.message });
            }
        });
    }

    function handleDelete(formData: FormData) {
        setFeedback(null);
        startDelete(async () => {
            const result = await deletePersonalApp(null, formData);
            if (result.status === 'success') {
                setConfirmDeleteId(null);
                setFeedback({ type: 'success', message: 'App deleted' });
                setTimeout(() => setFeedback(null), 3000);
            } else {
                setFeedback({ type: 'error', message: result.message });
            }
        });
    }

    const atLimit = initialApps.length >= maxApps;

    return (
        <div className="space-y-6">
            {/* Feedback toast */}
            {feedback && (
                <div className={`text-xs px-4 py-2 rounded-lg animate-in fade-in duration-200 ${feedback.type === 'success'
                        ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                    }`}>
                    {feedback.message}
                </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm text-ink-400">
                        {initialApps.length} / {maxApps} apps
                    </p>
                </div>
                {!showForm && !atLimit && (
                    <button
                        type="button"
                        onClick={() => { setShowForm(true); setEditingApp(null); setFeedback(null); }}
                        className="btn-primary btn-small flex items-center gap-2"
                    >
                        <Plus size={14} />
                        Add App
                    </button>
                )}
                {atLimit && !showForm && (
                    <span className="text-xs text-amber-400">Limit reached</span>
                )}
            </div>

            {/* Create Form */}
            {showForm && (
                <form ref={formRef} action={handleCreate} className="card-panel !p-6 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-ink-100">Add a New App</h3>
                        <button type="button" onClick={() => setShowForm(false)} className="text-ink-400 hover:text-ink-200 transition">
                            <X size={16} />
                        </button>
                    </div>
                    <HiddenCsrfInput />
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <label className="form-label" htmlFor="pa-name">Name *</label>
                            <input id="pa-name" name="name" type="text" required maxLength={100} className="input-field" placeholder="My Dashboard" />
                        </div>
                        <div>
                            <label className="form-label" htmlFor="pa-url">URL *</label>
                            <input id="pa-url" name="url" type="url" required maxLength={2048} className="input-field" placeholder="https://example.com" />
                        </div>
                    </div>
                    <div>
                        <label className="form-label" htmlFor="pa-desc">Description</label>
                        <input id="pa-desc" name="description" type="text" maxLength={500} className="input-field" placeholder="Optional description" />
                    </div>
                    <div>
                        <label className="form-label" htmlFor="pa-icon">Icon</label>
                        <input id="pa-icon" name="icon" type="file" accept="image/*" className="input-field text-xs" />
                    </div>
                    <div className="flex items-center gap-3">
                        <button type="submit" disabled={isCreating} className="btn-primary btn-small">
                            {isCreating ? <><Loader2 size={14} className="animate-spin inline mr-1" />Saving…</> : 'Create App'}
                        </button>
                        <button type="button" onClick={() => setShowForm(false)} className="btn-secondary btn-small" disabled={isCreating}>Cancel</button>
                    </div>
                </form>
            )}

            {/* Edit Form */}
            {editingApp && (
                <form action={handleUpdate} className="card-panel !p-6 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-ink-100">Editing: {editingApp.name}</h3>
                        <button type="button" onClick={() => setEditingApp(null)} className="text-ink-400 hover:text-ink-200 transition">
                            <X size={16} />
                        </button>
                    </div>
                    <HiddenCsrfInput />
                    <input type="hidden" name="appId" value={editingApp.id} />
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <label className="form-label" htmlFor="pa-edit-name">Name *</label>
                            <input id="pa-edit-name" name="name" type="text" required maxLength={100} className="input-field" defaultValue={editingApp.name} />
                        </div>
                        <div>
                            <label className="form-label" htmlFor="pa-edit-url">URL *</label>
                            <input id="pa-edit-url" name="url" type="url" required maxLength={2048} className="input-field" defaultValue={editingApp.url} />
                        </div>
                    </div>
                    <div>
                        <label className="form-label" htmlFor="pa-edit-desc">Description</label>
                        <input id="pa-edit-desc" name="description" type="text" maxLength={500} className="input-field" defaultValue={editingApp.description ?? ''} />
                    </div>
                    <div>
                        <label className="form-label" htmlFor="pa-edit-icon">Replace Icon</label>
                        <input id="pa-edit-icon" name="icon" type="file" accept="image/*" className="input-field text-xs" />
                    </div>
                    <div className="flex items-center gap-3">
                        <button type="submit" disabled={isUpdating} className="btn-primary btn-small">
                            {isUpdating ? <><Loader2 size={14} className="animate-spin inline mr-1" />Saving…</> : 'Save Changes'}
                        </button>
                        <button type="button" onClick={() => setEditingApp(null)} className="btn-secondary btn-small" disabled={isUpdating}>Cancel</button>
                    </div>
                </form>
            )}

            {/* App List */}
            {initialApps.length === 0 && !showForm ? (
                <div className="text-center py-12 text-ink-400">
                    <Globe className="mx-auto h-10 w-10 mb-3 opacity-50" />
                    <p className="text-sm">No personal apps yet</p>
                    <p className="text-xs mt-1">Add your own private app shortcuts to the portal</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {initialApps.map((app) => (
                        <div key={app.id} className="card-panel !p-0 overflow-hidden group">
                            <div className="flex items-center gap-4 p-4">
                                {/* Icon */}
                                <div className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                                    {app.icon && !iconError[app.id] ? (
                                        <img
                                            src={app.icon}
                                            alt=""
                                            className="h-6 w-6 object-contain"
                                            onError={() => setIconError(prev => ({ ...prev, [app.id]: true }))}
                                        />
                                    ) : (
                                        <LayoutGrid className="h-5 w-5 text-ink-400" />
                                    )}
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm text-ink-100 truncate">{app.name}</p>
                                    <p className="text-xs text-ink-400 truncate">{app.url}</p>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <a
                                        href={app.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-2 rounded-lg hover:bg-white/5 text-ink-400 hover:text-ocean-400 transition"
                                        title="Open"
                                    >
                                        <ExternalLink size={14} />
                                    </a>
                                    <button
                                        type="button"
                                        onClick={() => { setEditingApp(app); setShowForm(false); }}
                                        className="p-2 rounded-lg hover:bg-white/5 text-ink-400 hover:text-amber-400 transition"
                                        title="Edit"
                                    >
                                        <Pencil size={14} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setConfirmDeleteId(app.id)}
                                        className="p-2 rounded-lg hover:bg-white/5 text-ink-400 hover:text-rose-400 transition"
                                        title="Delete"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                            {app.description && confirmDeleteId !== app.id && (
                                <div className="px-4 pb-3 -mt-1">
                                    <p className="text-xs text-ink-500 truncate">{app.description}</p>
                                </div>
                            )}
                            {/* Inline delete confirmation */}
                            {confirmDeleteId === app.id && (
                                <div className="flex items-center justify-between gap-3 px-4 py-3 bg-rose-500/10 border-t border-rose-500/20 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <p className="text-xs text-rose-300">
                                        Delete <strong>&ldquo;{app.name}&rdquo;</strong>?
                                    </p>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <form action={handleDelete} className="inline">
                                            <HiddenCsrfInput />
                                            <input type="hidden" name="appId" value={app.id} />
                                            <button
                                                type="submit"
                                                disabled={isDeleting}
                                                className="px-3 py-1 text-xs font-medium rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 transition"
                                            >
                                                {isDeleting ? 'Deleting…' : 'Delete'}
                                            </button>
                                        </form>
                                        <button
                                            type="button"
                                            onClick={() => setConfirmDeleteId(null)}
                                            className="px-3 py-1 text-xs font-medium rounded-lg bg-white/5 text-ink-300 hover:bg-white/10 transition"
                                            disabled={isDeleting}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
