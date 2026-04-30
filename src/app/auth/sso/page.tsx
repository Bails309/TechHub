'use client';

import { useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { Loader2 } from 'lucide-react';

/**
 * Direct SSO Entrypoint
 * This page immediately triggers the Keycloak sign-in flow, bypassing the 
 * intermediate sign-in selection page.
 */
export default function SSOPage() {
    useEffect(() => {
        // Trigger Keycloak sign-in immediately. 
        // Redirects to Keycloak login page.
        void signIn('keycloak', { callbackUrl: '/' });
    }, []);

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
            <Loader2 className="h-10 w-10 text-ocean-500 animate-spin" />
            <div className="text-center">
                <h1 className="text-xl font-medium text-ink-900 dark:text-white">Redirecting to SSO</h1>
                <p className="text-ink-400 text-sm mt-1">Please wait while we connect to Keycloak...</p>
            </div>
        </div>
    );
}
