import React from 'react';

export default function AppCardSkeleton() {
    return (
        <div className="glass relative flex flex-col items-center justify-center gap-4 rounded-3xl p-6 h-[164px] md:h-[188px]">
            <div className="h-16 w-16 md:h-20 md:w-20 rounded-2xl bg-white/5 skeleton shrink-0" />
            <div className="h-5 md:h-6 w-3/4 rounded-md bg-white/5 skeleton shrink-0" />
            <div className="absolute bottom-5 h-3 md:h-4 w-1/3 rounded-md bg-white/5 skeleton shrink-0 opacity-0 md:group-hover:opacity-100" />
        </div>
    );
}
