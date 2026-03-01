'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';

export default function AppSearch({ initialQuery = '' }: { initialQuery?: string }) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [query, setQuery] = useState(initialQuery);

    // Sync internal state if the URL query changes externally (e.g. pagination)
    useEffect(() => {
        setQuery(initialQuery);
    }, [initialQuery]);

    useEffect(() => {
        // Only trigger if the user's input differs from the current active initialQuery
        if (query === initialQuery) return;

        const timer = setTimeout(() => {
            const params = new URLSearchParams(searchParams.toString());
            if (query) {
                params.set('q', query);
            } else {
                params.delete('q');
            }
            // Reset to first page on search
            params.delete('appPage');

            router.push(`${pathname}?${params.toString()}#catalogue`, { scroll: false });
        }, 300);

        return () => clearTimeout(timer);
    }, [query, pathname, router, searchParams, initialQuery]);

    return (
        <div className="relative mb-6">
            <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search apps by name or URL..."
                className="input-surface w-full rounded-full pl-11 pr-5 py-3 text-sm text-ink-100 shadow-glow/30 focus:outline-none focus:ring-2 focus:ring-ocean-400/60"
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-400" size={18} />
        </div>
    );
}
