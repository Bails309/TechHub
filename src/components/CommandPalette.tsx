'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { Search, Compass, CornerDownLeft } from 'lucide-react';
import { sanitizeIconUrl } from '../lib/sanitizeIconUrl';

interface PaletteApp {
    id: string;
    name: string;
    url: string;
    category?: string | null;
    icon?: string | null;
}

interface CommandPaletteProps {
    apps: PaletteApp[];
    isOpen: boolean;
    onClose: () => void;
}

export default function CommandPalette({ apps, isOpen, onClose }: CommandPaletteProps) {
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [recentApps, setRecentApps] = useState<PaletteApp[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);

    // Load recent apps from local storage
    useEffect(() => {
        if (!isOpen) return;
        try {
            const stored = window.localStorage.getItem('techhub-recent-apps');
            if (stored) {
                const ids = JSON.parse(stored) as string[];
                const recents = ids.map(id => (apps || []).find(a => a.id === id)).filter(Boolean) as PaletteApp[];
                setRecentApps(recents.slice(0, 5));
            } else {
                setRecentApps([]);
            }
        } catch {
            setRecentApps([]);
        }
    }, [apps, isOpen]);

    // Handle keyboard shortcuts to toggle palette
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // Focus input and reset state when opened
    useEffect(() => {
        if (isOpen) {
            // Use a slightly longer timeout and multiple attempts to ensure focus on all browsers
            const focusTimer = setTimeout(() => {
                inputRef.current?.focus();
            }, 50);
            
            setQuery('');
            setSelectedIndex(0);
            
            return () => clearTimeout(focusTimer);
        }
    }, [isOpen]);

    // Filter and group apps
    const filteredApps = useMemo(() => {
        const safeApps = apps || [];
        const trimmed = query.trim().toLowerCase();

        if (!trimmed) {
            // Show recent apps first, then all other apps alphabetically
            const recentIds = new Set(recentApps.map(a => a.id));
            const otherApps = [...safeApps]
                .filter(a => !recentIds.has(a.id))
                .sort((a, b) => {
                    // Sort by category first, then name
                    const catA = a.category || 'General';
                    const catB = b.category || 'General';
                    if (catA !== catB) return catA.localeCompare(catB);
                    return a.name.localeCompare(b.name);
                });

            return [...recentApps, ...otherApps];
        }

        return [...safeApps].filter(app => {
            const haystack = `${app.name} ${app.category ?? ''}`.toLowerCase();
            return haystack.includes(trimmed);
        }).sort((a, b) => {
            // Prioritize name matches
            const aName = a.name.toLowerCase();
            const bName = b.name.toLowerCase();
            
            if (aName === trimmed && bName !== trimmed) return -1;
            if (bName === trimmed && aName !== trimmed) return 1;
            
            if (aName.startsWith(trimmed) && !bName.startsWith(trimmed)) return -1;
            if (bName.startsWith(trimmed) && !aName.startsWith(trimmed)) return 1;
            
            return a.name.localeCompare(b.name);
        });
    }, [query, apps, recentApps]);

    // Keyboard navigation within the palette
    useEffect(() => {
        const handleNavigation = (e: KeyboardEvent) => {
            if (!isOpen || filteredApps.length === 0) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(prev => (prev + 1) % filteredApps.length);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(prev => (prev - 1 + filteredApps.length) % filteredApps.length);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const selected = filteredApps[selectedIndex];
                if (selected) {
                    launchApp(selected);
                }
            }
        };

        window.addEventListener('keydown', handleNavigation);
        return () => window.removeEventListener('keydown', handleNavigation);
    }, [isOpen, filteredApps, selectedIndex]);

    // Reset selection when query changes
    useEffect(() => {
        setSelectedIndex(0);
    }, [query]);

    const launchApp = (app: PaletteApp) => {
        // Save to recents
        try {
            const stored = window.localStorage.getItem('techhub-recent-apps');
            let ids: string[] = stored ? JSON.parse(stored) : [];
            ids = [app.id, ...ids.filter(id => id !== app.id)].slice(0, 5);
            window.localStorage.setItem('techhub-recent-apps', JSON.stringify(ids));
        } catch {
            // ignore
        }

        // Open app
        window.open(`/api/launch/${app.id}`, '_blank');
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] sm:pt-[20vh] px-4 animate-in fade-in duration-200">
            <div
                className="fixed inset-0 bg-ink-900/60 backdrop-blur-sm transition-opacity"
                onClick={onClose}
                aria-hidden="true"
            />

            <div className="relative w-full max-w-2xl bg-white dark:bg-[#0A0C10] rounded-2xl shadow-2xl border border-ink-200 dark:border-ink-800 overflow-hidden flex flex-col animate-in zoom-in-95 slide-in-from-bottom-2 duration-200">

                {/* Search Input */}
                <div className="flex items-center px-4 py-4 border-b border-ink-100 dark:border-ink-800">
                    <Search className="h-5 w-5 text-ink-400 mr-3 shrink-0" />
                    <input
                        ref={inputRef}
                        type="text"
                        className="flex-1 bg-transparent text-lg text-ink-900 dark:text-ink-50 placeholder-ink-400 focus:outline-none"
                        placeholder="Search applications..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                    <div className="hidden sm:flex items-center gap-1 text-xs text-ink-400 font-mono bg-ink-50 dark:bg-ink-800 px-2 py-1 rounded">
                        <span>ESC</span>
                    </div>
                </div>

                {/* Results List */}
                <div className="max-h-[60vh] overflow-y-auto p-2">
                    {filteredApps.length === 0 ? (
                        <div className="p-8 text-center text-ink-400">
                            <Compass className="h-10 w-10 mx-auto mb-3 opacity-20" />
                            <p>No applications found for "{query}"</p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {filteredApps.map((app, index) => {
                                const isSelected = index === selectedIndex;
                                const safeIcon = sanitizeIconUrl(app.icon);
                                
                                // Grouping logic
                                let header = null;
                                if (!query) {
                                    if (recentApps.length > 0 && index === 0) {
                                        header = 'Recently Launched';
                                    } else if (index === recentApps.length) {
                                        header = 'All Applications';
                                    }
                                    
                                    // Further group "All Applications" by category if desired
                                    // But let's keep it simple for now as requested
                                }

                                return (
                                    <div key={app.id}>
                                        {header && (
                                            <div className={`px-3 py-2 text-xs font-semibold text-ink-400 uppercase tracking-wider ${index > 0 ? 'mt-4 border-t border-ink-100 dark:border-ink-800/50 pt-4' : ''} mb-1`}>
                                                {header}
                                            </div>
                                        )}
                                        <button
                                            className={`w-full flex items-center px-4 py-3 rounded-xl text-left transition-colors ${isSelected
                                                    ? 'bg-ocean-50 dark:bg-ocean-500/10'
                                                    : 'hover:bg-ink-50 dark:hover:bg-ink-800/50'
                                                }`}
                                            onClick={() => launchApp(app)}
                                            onMouseEnter={() => setSelectedIndex(index)}
                                        >
                                            <div className="h-8 w-8 rounded-lg bg-ink-100 dark:bg-ink-800 flex items-center justify-center shrink-0 mr-4">
                                                {safeIcon ? (
                                                    <img src={safeIcon} alt="" className="h-5 w-5 object-contain" />
                                                ) : (
                                                    <div className="h-3 w-3 rounded-full bg-ocean-400" />
                                                )}
                                            </div>

                                            <div className="flex flex-col flex-1 min-w-0">
                                                <span className={`text-sm font-medium truncate ${isSelected ? 'text-ocean-600 dark:text-ocean-400' : 'text-ink-700 dark:text-ink-100'}`}>
                                                    {app.name}
                                                </span>
                                                {app.category && (
                                                    <span className="text-xs text-ink-400 truncate">
                                                        {app.category}
                                                    </span>
                                                )}
                                            </div>

                                            {isSelected && (
                                                <CornerDownLeft className="h-4 w-4 text-ocean-500 shrink-0 ml-3 opacity-50" />
                                            )}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer Hints */}
                <div className="hidden sm:flex items-center justify-between px-4 py-3 bg-ink-50 dark:bg-ink-900 border-t border-ink-100 dark:border-ink-800">
                    <div className="flex items-center gap-4 text-xs text-ink-400">
                        <span className="flex items-center gap-1"><kbd className="font-mono bg-ink-200 dark:bg-ink-800 px-1 rounded">↑↓</kbd> to navigate</span>
                        <span className="flex items-center gap-1"><kbd className="font-mono bg-ink-200 dark:bg-ink-800 px-1 rounded">↵</kbd> to launch</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

