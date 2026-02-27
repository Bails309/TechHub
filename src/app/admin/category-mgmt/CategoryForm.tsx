'use client';

import { useState } from 'react';
import { createCategory, updateCategory } from './actions';

export default function CategoryForm({
    category,
    onSuccess
}: {
    category?: any,
    onSuccess?: () => void
}) {
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(formData: FormData) {
        setLoading(true);
        setError(null);
        const res = category
            ? await updateCategory(category.id, formData)
            : await createCategory(formData);

        setLoading(false);
        if (res.success) {
            if (!category) {
                // Clear form if new category
                const form = document.getElementById('category-form') as HTMLFormElement;
                form?.reset();
            }
            onSuccess?.();
        } else {
            setError(res.error || 'Something went wrong');
        }
    }

    return (
        <form id={category ? `edit-form-${category.id}` : 'category-form'} action={handleSubmit} className="space-y-4">
            <div>
                <label className="block text-xs font-medium text-ink-400 mb-1">Name</label>
                <input
                    name="name"
                    defaultValue={category?.name}
                    className="w-full bg-ink-900 border border-ink-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-ocean-500 transition"
                    required
                />
            </div>
            <div>
                <label className="block text-xs font-medium text-ink-400 mb-1">Description</label>
                <textarea
                    name="description"
                    defaultValue={category?.description}
                    className="w-full bg-ink-900 border border-ink-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-ocean-500 transition h-20"
                />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-medium text-ink-400 mb-1">Icon (Lucide Name)</label>
                    <input
                        name="icon"
                        defaultValue={category?.icon}
                        className="w-full bg-ink-900 border border-ink-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-ocean-500 transition"
                        placeholder="e.g. Activity"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-ink-400 mb-1">Display Order</label>
                    <input
                        name="order"
                        type="number"
                        defaultValue={category?.order ?? 0}
                        className="w-full bg-ink-900 border border-ink-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-ocean-500 transition"
                    />
                </div>
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full"
            >
                {loading ? 'Saving...' : category ? 'Update Category' : 'Create Category'}
            </button>
        </form>
    );
}
