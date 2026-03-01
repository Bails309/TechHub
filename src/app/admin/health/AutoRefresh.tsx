'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCcw } from 'lucide-react';

export default function AutoRefresh({ intervalMs = 60000 }: { intervalMs?: number }) {
    const router = useRouter();
    const [secondsLeft, setSecondsLeft] = useState(intervalMs / 1000);
    const [isRefreshing, setIsRefreshing] = useState(false);

    useEffect(() => {
        const timer = setInterval(() => {
            setSecondsLeft((prev) => {
                if (prev <= 1) {
                    setIsRefreshing(true);
                    router.refresh();
                    return intervalMs / 1000;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [router, intervalMs]);

    // Reset refreshing state after a short delay
    useEffect(() => {
        if (isRefreshing) {
            const timeout = setTimeout(() => setIsRefreshing(false), 2000);
            return () => clearTimeout(timeout);
        }
    }, [isRefreshing]);

    return (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-medium text-muted-foreground">
            <RefreshCcw size={12} className={isRefreshing ? 'animate-spin text-ocean-500' : ''} />
            <span>Auto-refreshing in <span className="font-mono text-foreground font-bold">{secondsLeft}s</span></span>
        </div>
    );
}
