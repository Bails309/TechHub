'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import type { SelectOption } from './SelectField';

interface SSOUserAutocompleteProps {
    options: SelectOption[];
    onSelect?: (email: string) => void;
    defaultValue?: string;
    name?: string;
}

export default function SSOUserAutocomplete({ options, onSelect, defaultValue = '', name = 'email' }: SSOUserAutocompleteProps) {
    const [query, setQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [selectedEmail, setSelectedEmail] = useState(defaultValue);
    const wrapperRef = useRef<HTMLDivElement>(null);

    const filteredOptions = options.filter(option =>
        option.label.toLowerCase().includes(query.toLowerCase()) ||
        option.value.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 10);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (option: SelectOption) => {
        setSelectedEmail(option.value);
        setQuery('');
        setIsOpen(false);
        onSelect?.(option.value);
    };

    const handleClear = () => {
        setSelectedEmail('');
        setQuery('');
        setIsOpen(false);
        onSelect?.('');
    };

    const selectedOption = options.find(opt => opt.value === selectedEmail);

    return (
        <div className="relative w-full" ref={wrapperRef}>
            <input type="hidden" name={name} value={selectedEmail} />

            {selectedEmail ? (
                <div className="flex items-center justify-between input-surface rounded-full px-5 py-3 text-ink-100 shadow-glow/30">
                    <span className="truncate text-sm">
                        {selectedOption?.label || selectedEmail}
                    </span>
                    <button
                        type="button"
                        onClick={handleClear}
                        className="p-1 hover:text-rose-400 transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>
            ) : (
                <div className="relative">
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setIsOpen(true);
                        }}
                        onFocus={() => setIsOpen(true)}
                        placeholder="Search user by name or email..."
                        className="input-surface w-full rounded-full pl-11 pr-5 py-3 text-sm text-ink-100 shadow-glow/30 focus:outline-none focus:ring-2 focus:ring-ocean-400/60"
                        autoComplete="off"
                    />
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-400" size={18} />

                    {isOpen && query.trim() && (
                        <div className="absolute z-20 mt-2 w-full max-h-56 overflow-y-auto rounded-2xl p-2 shadow-glow/40 bg-black border border-ink-800">
                            {filteredOptions.length > 0 ? (
                                <ul>
                                    {filteredOptions.map((option) => (
                                        <li key={option.value}>
                                            <button
                                                type="button"
                                                onClick={() => handleSelect(option)}
                                                className="flex w-full items-center rounded-xl px-4 py-3 text-left text-sm text-ink-200 hover:bg-white/10 transition-colors"
                                            >
                                                {option.label}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="px-4 py-3 text-sm text-ink-400 italic">No users found.</p>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
