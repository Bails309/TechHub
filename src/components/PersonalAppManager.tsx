'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useFormState } from 'react-dom';
import HiddenCsrfInput from '@/components/HiddenCsrfInput';
import { createPersonalApp, updatePersonalApp, deletePersonalApp } from '@/app/profile/personalAppActions';
import { Plus, Pencil, Trash2, Globe, X, ExternalLink, LayoutGrid } from 'lucide-react';

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

interface ActionState {
    status: 'idle' | 'success' | 'error';
    message: string;
    app?: any;
}

const createInitial: ActionState = { status: 'idle', message: '' };
const updateInitial: ActionState = { status: 'idle', message: '' };
const deleteInitial: ActionState = { status: 'idle', message: '' };

export default function PersonalAppManager({ apps: initialApps, maxApps = 25 }: PersonalAppManagerProps) {
    const [showForm, setShowForm] = useState(false);
    const [editingApp, setEditingApp] = useState<PersonalAppData | null>(null);
    const [iconError, setIconError] = useState<Record<string, boolean>>({});
    const formRef = useRef<HTMLFormElement>(null);
    const [isPending, startTransition] = useTransition();

    const [createState, createAction] = useFormState(createPersonalApp as any, createInitial);
    const [updateState, updateAction] = useFormState(updatePersonalApp as any, updateInitial);
    const [deleteState, deleteAction] = useFormState(deletePersonalApp as any, deleteInitial);

    // Reset form on successful create
    useEffect(() => {
        if (createState.status === 'success') {
            setShowForm(false);
            formRef.current?.reset();
        }
    }, [createState.status]);

    // Reset edit on successful update
    useEffect(() => {
        if (updateState.status === 'success') {
            setEditingApp(null);
        }
    }, [updateState.status]);

    const atLimit = initialApps.length >= maxApps;

    return (
        <div className="space-y-6">
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
                        onClick={() => { setShowForm(true); setEditingApp(null); }}
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
                <form ref={formRef} action={createAction} className="card-panel !p-6 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
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
                        <button type="submit" className="btn-primary btn-small">Create App</button>
                        <button type="button" onClick={() => setShowForm(false)} className="btn-secondary btn-small">Cancel</button>
                    </div>
                    {createState.status !== 'idle' && (
                        <p className={createState.status === 'success' ? 'text-emerald-300 text-xs' : 'text-rose-300 text-xs'}>
                            {createState.message}
                        </p>
                    )}
                </form>
            )}

            {/* Edit Form */}
            {editingApp && (
                <form action={updateAction} className="card-panel !p-6 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
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
                        <button type="submit" className="btn-primary btn-small">Save Changes</button>
                        <button type="button" onClick={() => setEditingApp(null)} className="btn-secondary btn-small">Cancel</button>
                    </div>
                    {updateState.status !== 'idle' && (
                        <p className={updateState.status === 'success' ? 'text-emerald-300 text-xs' : 'text-rose-300 text-xs'}>
                            {updateState.message}
                        </p>
                    )}
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
                                    <form action={deleteAction} className="inline">
                                        <HiddenCsrfInput />
                                        <input type="hidden" name="appId" value={app.id} />
                                        <button
                                            type="submit"
                                            className="p-2 rounded-lg hover:bg-white/5 text-ink-400 hover:text-rose-400 transition"
                                            title="Delete"
                                            onClick={(e) => {
                                                if (!confirm(`Delete "${app.name}"?`)) {
                                                    e.preventDefault();
                                                }
                                            }}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </form>
                                </div>
                            </div>
                            {app.description && (
                                <div className="px-4 pb-3 -mt-1">
                                    <p className="text-xs text-ink-500 truncate">{app.description}</p>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Delete status feedback */}
            {deleteState.status === 'error' && (
                <p className="text-rose-300 text-xs text-center">{deleteState.message}</p>
            )}
        </div>
    );
}
