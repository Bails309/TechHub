'use client';

import { useState, useEffect, useRef } from 'react';
import { searchUsers } from '../app/admin/actions';

export type UserOption = {
    id: string;
    name: string | null;
    email: string | null;
};

interface UserAutocompleteProps {
    initialSelectedUsers?: UserOption[];
}

export default function UserAutocomplete({ initialSelectedUsers = [] }: UserAutocompleteProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<UserOption[]>([]);
    const [selectedUsers, setSelectedUsers] = useState<UserOption[]>(initialSelectedUsers);
    const [isSearching, setIsSearching] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const debounceTimer = useRef<NodeJS.Timeout | null>(null);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Sync state if props change (e.g. after a server action revalidates)
    const initialSelectedKey = JSON.stringify(initialSelectedUsers);
    useEffect(() => {
        setSelectedUsers(initialSelectedUsers);
    }, [initialSelectedKey]);

    // Perform search
    useEffect(() => {
        if (!query.trim()) {
            setResults([]);
            setIsOpen(false);
            return;
        }

        if (debounceTimer.current) clearTimeout(debounceTimer.current);

        debounceTimer.current = setTimeout(() => {
            setIsSearching(true);
            searchUsers(query, 10)
                .then((users) => {
                    setResults(users);
                    setIsOpen(true);
                })
                .catch((err) => console.error('Error searching users:', err))
                .finally(() => setIsSearching(false));
        }, 300);

        return () => {
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
        };
    }, [query]);

    const handleSelectUser = (user: UserOption) => {
        if (!selectedUsers.some((u) => u.id === user.id)) {
            setSelectedUsers([...selectedUsers, user]);
        }
        setQuery('');
        setIsOpen(false);
    };

    const handleRemoveUser = (userId: string) => {
        setSelectedUsers(selectedUsers.filter((u) => u.id !== userId));
    };

    return (
        <div className="md:col-span-2 space-y-2" ref={wrapperRef}>
            <label className="text-xs uppercase tracking-[0.2em] text-ink-400">
                Assign users (for specific user apps)
            </label>

            <div className="relative">
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => { if (query.trim() && results.length > 0) setIsOpen(true) }}
                    placeholder={isSearching ? 'Searching...' : 'Search by name or email...'}
                    className="input-field w-full"
                />

                {isOpen && results.length > 0 && (
                    <ul className="absolute z-10 mt-1 w-full max-h-60 overflow-auto border border-ink-800 bg-black rounded-xl shadow-xl">
                        {results.map((user) => (
                            <li
                                key={user.id}
                                className="px-4 py-2 hover:bg-white/10 cursor-pointer text-sm text-ink-200 border-b border-ink-800 last:border-0"
                                onClick={() => handleSelectUser(user)}
                            >
                                <span className="font-semibold">{user.name || 'Unknown'}</span>{' '}
                                {user.email && <span className="text-ink-400 opacity-80">({user.email})</span>}
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* Hidden inputs to pass data when the form submits */}
            {selectedUsers.map((user) => (
                <input key={`hidden-${user.id}`} type="hidden" name="userIds" value={user.id} />
            ))}

            <div className="flex flex-wrap gap-2 mt-3">
                {selectedUsers.length === 0 && (
                    <span className="text-xs text-ink-400 italic">No users currently assigned.</span>
                )}
                {selectedUsers.map((user) => (
                    <div
                        key={user.id}
                        className="flex items-center gap-2 bg-white/5 border border-ink-800 px-3 py-1 rounded-full text-xs text-ink-200"
                    >
                        <span>{user.name || user.email || user.id}</span>
                        <button
                            type="button"
                            onClick={() => handleRemoveUser(user.id)}
                            className="text-ink-400 hover:text-rose-400 focus:outline-none"
                            aria-label={`Remove ${user.name}`}
                        >
                            &times;
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
