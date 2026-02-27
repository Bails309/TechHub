export default function AdminLoading() {
    return (
        <div className="px-6 md:px-12 py-12 space-y-8 animate-pulse">
            {/* Header Skeleton */}
            <section className="card-panel h-32">
                <div className="h-8 w-64 bg-ink-800/50 rounded-lg mb-4" />
                <div className="h-4 w-96 bg-ink-800/30 rounded-lg" />
            </section>

            {/* Grid Cards Skeleton */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="glass rounded-[32px] p-6 h-40">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="rounded-full bg-ink-800/50 p-5 w-10 h-10" />
                            <div className="h-6 w-24 bg-ink-800/50 rounded-lg" />
                        </div>
                        <div className="h-8 w-16 bg-ink-800/50 rounded-lg mb-2" />
                        <div className="h-4 w-full bg-ink-800/30 rounded-lg" />
                    </div>
                ))}
            </div>

            {/* Analytics Skeleton */}
            <section className="card-panel h-96">
                <div className="flex items-center justify-between mb-8">
                    <div className="h-6 w-48 bg-ink-800/50 rounded-lg" />
                    <div className="h-4 w-32 bg-ink-800/30 rounded-lg" />
                </div>
                <div className="grid grid-cols-2 gap-8 h-full pb-16">
                    <div className="bg-ink-800/20 rounded-2xl" />
                    <div className="bg-ink-800/20 rounded-2xl" />
                </div>
            </section>

            {/* Recent Activity Skeleton */}
            <section className="card-panel">
                <div className="flex items-center justify-between mb-6">
                    <div className="h-6 w-48 bg-ink-800/50 rounded-lg" />
                    <div className="h-8 w-32 bg-ink-800/30 rounded-full" />
                </div>
                <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-16 rounded-2xl border border-ink-800/50 bg-ink-900/50" />
                    ))}
                </div>
            </section>
        </div>
    );
}
