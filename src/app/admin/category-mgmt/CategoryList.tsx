'use client';

import { Trash2, Edit2, GripVertical } from 'lucide-react';
import { deleteCategory } from './actions';
import { useState } from 'react';
import CategoryForm from './CategoryForm';

export default function CategoryList({ categories }: { categories: any[] }) {
    const [editingId, setEditingId] = useState<string | null>(null);

    if (categories.length === 0) {
        return (
            <div className="card-panel py-12 text-center">
                <p className="text-ink-400">No categories found. Create one to get started.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {categories.map((category) => (
                <div key={category.id} className="card-panel !p-4">
                    {editingId === category.id ? (
                        <div className="pb-2">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="font-semibold text-lg">Edit Category: {category.name}</h3>
                                <button onClick={() => setEditingId(null)} className="text-xs text-ink-400 hover:text-ink-200 transition">Cancel</button>
                            </div>
                            <CategoryForm category={category} onSuccess={() => setEditingId(null)} />
                        </div>
                    ) : (
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <div className="text-ink-500 cursor-grab active:cursor-grabbing">
                                    <GripVertical size={18} />
                                </div>
                                <div className="w-10 h-10 rounded-xl bg-ocean-500/10 flex items-center justify-center text-ocean-400 font-bold">
                                    {category.name.charAt(0)}
                                </div>
                                <div>
                                    <h3 className="font-semibold text-ink-100">{category.name}</h3>
                                    <p className="text-xs text-ink-400 truncate max-w-md">{category.description || 'No description'}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setEditingId(category.id)}
                                    className="p-2 hover:bg-white/5 rounded-lg text-ink-400 hover:text-ocean-400 transition"
                                    title="Edit Category"
                                >
                                    <Edit2 size={18} />
                                </button>
                                <form action={async () => {
                                    if (confirm('Are you sure you want to delete this category? Apps will be unlinked.')) {
                                        await deleteCategory(category.id);
                                    }
                                }}>
                                    <button className="p-2 hover:bg-white/5 rounded-lg text-ink-400 hover:text-red-400 transition" title="Delete Category">
                                        <Trash2 size={18} />
                                    </button>
                                </form>
                            </div>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
