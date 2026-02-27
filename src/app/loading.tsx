import React from 'react';
import AppCardSkeleton from '../components/AppCardSkeleton';
import StatsStrip from '../components/StatsStrip';


export default function Loading() {
    return (
        <div className="px-6 md:px-12 py-12 space-y-12">
            <StatsStrip
                appCount={0}
                categories={0}
                averageLatency="..."
            />

            <div className="space-y-8">
                <div className="flex flex-wrap items-center gap-2 mb-8">
                    <div className="h-8 w-24 rounded-full bg-white/5 skeleton shrink-0" />
                    <div className="h-8 w-20 rounded-full bg-white/5 skeleton shrink-0" />
                    <div className="h-8 w-16 rounded-full bg-white/5 skeleton shrink-0" />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
                    {Array.from({ length: 12 }).map((_, i) => (
                        <AppCardSkeleton key={i} />
                    ))}
                </div>
            </div>
        </div>
    );
}
