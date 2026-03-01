'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Search } from 'lucide-react';

export default function UserSearch({
    initialQuery = '',
    anchor = 'users-list'
}: {
    initialQuery?: string;
    anchor?: string;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [query, setQuery] = useState(initialQuery);

    // Sync state with server-side query prop
    useEffect(() => {
        setQuery(initialQuery);
    }, [initialQuery]);

    useEffect(() => {
        const timer = setTimeout(() => {
            // Only push if the query actually changed relative to current params
            const currentQ = searchParams.get('q') ?? '';
            if (query === currentQ) return;

            const params = new URLSearchParams(searchParams.toString());
            if (query) {
                params.set('q', query);
            } else {
                params.delete('q');
            }
            // Reset to page 1 on new search
            params.set('userPage', '1');
            params.set('accessPage', '1');

            // Push with fragment to stay at designated section
            router.push(`${pathname}?${params.toString()}#${anchor}`);
        }, 300);

        return () => clearTimeout(timer);
    }, [query, router, pathname, searchParams, anchor]);

    return (
        <div className="relative max-w-sm mb-4">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
                type="text"
                placeholder="Search by name or email..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="input-field pl-10 h-9 text-sm"
            />
        </div>
    );
}
