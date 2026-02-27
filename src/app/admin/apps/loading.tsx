export default function AppsLoading() {
    return (
        <div className="px-6 md:px-12 py-12 space-y-8 animate-pulse">
            {/* Header Skeleton */}
            <section className="card-panel h-32">
                <div className="h-8 w-48 bg-ink-800/50 rounded-lg mb-4" />
                <div className="h-4 w-72 bg-ink-800/30 rounded-lg" />
            </section>

            {/* Add App Form Skeleton */}
            <section className="card-panel h-64">
                <div className="h-7 w-40 bg-ink-800/50 rounded-lg mb-6" />
                <div className="grid gap-6 md:grid-cols-2">
                    <div className="h-10 bg-ink-800/20 rounded-xl" />
                    <div className="h-10 bg-ink-800/20 rounded-xl" />
                    <div className="h-10 bg-ink-800/20 rounded-xl" />
                    <div className="h-10 bg-ink-800/20 rounded-xl" />
                </div>
            </section>

            {/* Catalogue List Skeleton */}
            <section className="card-panel">
                <div className="flex items-center justify-between mb-8">
                    <div className="h-7 w-48 bg-ink-800/50 rounded-lg" />
                    <div className="h-4 w-64 bg-ink-800/30 rounded-lg" />
                </div>
                <div className="space-y-4">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="card-panel !p-5">
                            <div className="flex justify-between items-center">
                                <div className="space-y-2">
                                    <div className="h-5 w-48 bg-ink-800/50 rounded-lg" />
                                    <div className="h-3 w-32 bg-ink-800/30 rounded-lg" />
                                </div>
                                <div className="flex gap-2">
                                    <div className="h-8 w-16 bg-ink-800/30 rounded-full" />
                                    <div className="h-8 w-16 bg-ink-800/30 rounded-full" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
