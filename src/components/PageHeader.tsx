'use client';

import { Search, Command } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function PageHeader() {
    const [searchValue, setSearchValue] = useState('');

    const handleSearch = (value: string) => {
        setSearchValue(value);
        try {
            window.localStorage.setItem('techhub-portal-search', value);
            window.dispatchEvent(new CustomEvent('techhub-search', { detail: value }));
        } catch {
            window.dispatchEvent(new CustomEvent('techhub-search', { detail: value }));
        }
    };

    useEffect(() => {
        try {
            const stored = window.localStorage.getItem('techhub-portal-search');
            if (stored) {
                setSearchValue(stored);
            }
        } catch {
            setSearchValue('');
        }
        const handler = (event: Event) => {
            const detail = (event as CustomEvent<string>).detail ?? '';
            setSearchValue(detail);
        };
        window.addEventListener('techhub-search', handler);
        return () => window.removeEventListener('techhub-search', handler);
    }, []);

    return (
        <header className="sticky top-0 z-30 w-full h-16 glass border-b border-ink-200/50 dark:border-white/5 flex items-center px-4 lg:px-8 justify-end">
            {/* Search Input */}
            <div className="hidden sm:flex group relative items-center w-full max-w-sm rounded-full bg-ink-100/50 dark:bg-ink-900/50 border border-ink-200 dark:border-ink-800 transition-all focus-within:ring-2 focus-within:ring-ocean-500 focus-within:border-ocean-500">
                <Search size={16} className="text-ink-400 absolute left-3" />
                <input
                    type="search"
                    placeholder="Search applications..."
                    value={searchValue}
                    onChange={(event) => handleSearch(event.target.value)}
                    className="w-full bg-transparent py-2 pl-10 pr-12 text-sm text-ink-900 dark:text-ink-50 placeholder:text-ink-400 focus:outline-none"
                    aria-label="Search apps"
                />
                <div className="absolute right-3 flex items-center gap-1 opacity-50 transition-opacity group-focus-within:opacity-100">
                    <kbd className="hidden lg:inline-flex items-center justify-center font-mono text-[10px] bg-ink-200 dark:bg-ink-800 rounded px-1 text-ink-500 dark:text-ink-400">
                        <Command size={10} className="mr-0.5" /> K
                    </kbd>
                </div>
            </div>
        </header>
    );
}
