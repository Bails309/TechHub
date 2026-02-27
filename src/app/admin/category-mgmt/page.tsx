import { prisma } from '../../../lib/prisma';
import CategoryList from './CategoryList';
import CategoryForm from './CategoryForm';

export const dynamic = 'force-dynamic';

export default async function CategoriesPage() {
    const categories = await prisma.category.findMany({
        orderBy: { order: 'asc' },
    });

    return (
        <div className="px-6 md:px-12 py-12 space-y-8">
            <section className="card-panel">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="font-serif text-3xl">Categories</h1>
                        <p className="text-ink-200 mt-2">
                            Manage app categories, descriptions, and their display order.
                        </p>
                    </div>
                </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    <div className="flex items-center justify-between">
                        <h2 className="font-serif text-2xl">Existing Categories</h2>
                        <span className="text-xs text-ink-400">{categories.length} categories total</span>
                    </div>
                    <CategoryList categories={categories} />
                </div>
                <div className="space-y-6">
                    <h2 className="font-serif text-2xl">Add New Category</h2>
                    <div className="card-panel">
                        <CategoryForm />
                    </div>

                    <div className="card-panel bg-ocean-500/5 border-ocean-500/20">
                        <h3 className="font-semibold text-ocean-300 mb-2 text-sm">Pro Tip</h3>
                        <p className="text-xs text-ink-300 leading-relaxed">
                            Categories help users find apps faster. Use descriptive names and logical display orders.
                            Icon names should correspond to Lucide React icons.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
