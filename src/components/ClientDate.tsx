'use client';

import { useEffect, useState } from 'react';

/**
 * Renders a Date object securely on the client side using the browser's local timezone.
 * Avoids Next.js hydration mismatch errors by rendering a blank or fallback string 
 * on the server, then adopting the browser's `toLocaleString()` immediately upon mount.
 */
export default function ClientDate({ date, fallback = '' }: { date: Date | string | number, fallback?: string }) {
    const [formatted, setFormatted] = useState<string>(fallback);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        try {
            const d = new Date(date);
            setFormatted(d.toLocaleString());
        } catch {
            setFormatted(String(date));
        }
    }, [date]);

    if (!mounted) {
        // Return a placeholder of the same approximate shape to avoid huge layout shifts, 
        // or exact fallback if provided by the server
        return <span className="opacity-0">{fallback || '00/00/0000, 00:00:00 AM'}</span>;
    }

    return <span>{formatted}</span>;
}
