'use client';

import { useState } from 'react';
import { getAuditDetails } from './actions';

interface AuditDetailsProps {
    auditId: string;
}

export default function AuditDetails({ auditId }: AuditDetailsProps) {
    const [details, setDetails] = useState<any>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const toggleOpen = async () => {
        if (!isOpen && !details) {
            setIsLoading(true);
            try {
                const data = await getAuditDetails(auditId);
                setDetails(data);
            } catch (error) {
                console.error('Failed to fetch audit details:', error);
            } finally {
                setIsLoading(false);
            }
        }
        setIsOpen(!isOpen);
    };

    return (
        <div className="mt-3">
            <button
                onClick={toggleOpen}
                className="cursor-pointer text-xs text-ocean-400 hover:text-ocean-300 transition list-none flex items-center gap-1 pt-2 border-t border-ink-800/50 w-full text-left"
            >
                <span className={`transition ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                {isLoading ? 'Loading details...' : isOpen ? 'Hide details' : 'View details'}
            </button>
            {isOpen && details && (
                <div className="mt-2 glass rounded-xl overflow-hidden shadow-inner animate-in fade-in slide-in-from-top-1 duration-200">
                    <pre className="overflow-x-auto p-4 text-[10px] text-ink-200 font-mono">
                        {JSON.stringify(details, null, 2)}
                    </pre>
                </div>
            )}
            {isOpen && !details && !isLoading && (
                <p className="mt-2 text-xs text-ink-400 italic px-4">No details recorded for this entry.</p>
            )}
        </div>
    );
}
