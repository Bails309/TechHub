'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

export interface RoleOption {
    value: string;
    label: string;
}

interface RoleMultiSelectProps {
    options: RoleOption[];
    initialSelected?: string[];
}

export default function RoleMultiSelect({ options, initialSelected = [] }: RoleMultiSelectProps) {
    const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>(initialSelected);
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const form = wrapperRef.current?.closest('form');
        if (!form) return;

        const handleReset = () => {
            setSelectedRoleIds(initialSelected);
            setIsOpen(false);
        };

        form.addEventListener('reset', handleReset);
        return () => form.removeEventListener('reset', handleReset);
    }, [initialSelected]);

    // Sync state if props change (e.g. after a server action revalidates)
    const initialSelectedKey = JSON.stringify(initialSelected);
    useEffect(() => {
        setSelectedRoleIds(initialSelected);
    }, [initialSelectedKey]);

    const toggleRole = (roleId: string) => {
        setSelectedRoleIds((prev) =>
            prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]
        );
    };

    const handleRemoveRole = (roleId: string) => {
        setSelectedRoleIds((prev) => prev.filter((id) => id !== roleId));
    };

    const getRoleLabel = (id: string) => options.find((opt) => opt.value === id)?.label || id;

    return (
        <div className="md:col-span-2 space-y-2" ref={wrapperRef}>
            <label className="text-xs uppercase tracking-[0.2em] text-ink-400">
                Assign Roles (for role-based apps)
            </label>

            <div className="relative">
                <button
                    type="button"
                    onClick={() => setIsOpen((prev) => !prev)}
                    className="input-surface flex w-full items-center justify-between rounded-full px-5 py-3 text-ink-100 shadow-glow/30 focus:outline-none focus:ring-2 focus:ring-ocean-400/60"
                >
                    <span className="truncate text-ink-400">
                        {selectedRoleIds.length > 0
                            ? `${selectedRoleIds.length} role(s) selected`
                            : 'Select roles...'}
                    </span>
                    <ChevronDown size={18} className={`transition ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {isOpen && (
                    <div className="absolute z-20 mt-2 w-full max-h-56 overflow-y-auto rounded-2xl p-2 shadow-glow/40 bg-black border border-ink-800">
                        <ul>
                            {options.map((option) => {
                                const isSelected = selectedRoleIds.includes(option.value);
                                return (
                                    <li key={option.value}>
                                        <button
                                            type="button"
                                            onClick={() => toggleRole(option.value)}
                                            className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${isSelected ? 'bg-ocean-500/20 text-ocean-300' : 'text-ink-200 hover:bg-white/10'
                                                }`}
                                        >
                                            <span>{option.label}</span>
                                            {isSelected && <span className="text-ocean-400 text-xs">✓</span>}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}
            </div>

            {selectedRoleIds.map((id) => (
                <input key={`hidden-role-${id}`} type="hidden" name="roleIds" value={id} />
            ))}

            <div className="flex flex-wrap gap-2 mt-3">
                {selectedRoleIds.length === 0 && (
                    <span className="text-xs text-ink-400 italic">No roles currently assigned.</span>
                )}
                {selectedRoleIds.map((id) => (
                    <div
                        key={id}
                        className="flex items-center gap-2 bg-white/5 border border-ink-800 px-3 py-1 rounded-full text-xs text-ink-200 animate-in fade-in slide-in-from-bottom-2"
                    >
                        <span>{getRoleLabel(id)}</span>
                        <button
                            type="button"
                            onClick={() => handleRemoveRole(id)}
                            className="text-ink-400 hover:text-rose-400 focus:outline-none"
                            aria-label={`Remove role`}
                        >
                            &times;
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
