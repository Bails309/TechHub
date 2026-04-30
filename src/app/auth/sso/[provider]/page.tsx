'use client';

import { useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { useParams, useSearchParams } from 'next/navigation';

/**
 * Direct SSO entrypoint to bypass the manual sign-in page.
 * Usage: /auth/sso/keycloak or /auth/sso/azure-ad
 */
export default function SsoQuickSignIn() {
    const params = useParams();
    const searchParams = useSearchParams();
    const provider = params?.provider as string;
    const callbackUrl = searchParams.get('callbackUrl') || '/auth/post-login';

    useEffect(() => {
        if (provider) {
            // Trigger the sign-in flow immediately
            void signIn(provider, { callbackUrl });
        }
    }, [provider, callbackUrl]);

    return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center space-y-6 animate-in fade-in duration-500">
                <div className="relative">
                    <div className="h-16 w-16 border-4 border-ocean-500/20 rounded-full mx-auto"></div>
                    <div className="h-16 w-16 border-4 border-ocean-500 border-t-transparent rounded-full animate-spin absolute inset-0 mx-auto"></div>
                </div>
                <div className="space-y-2">
                    <h2 className="text-xl font-medium text-ink-900 dark:text-ink-50">
                        Redirecting to SSO
                    </h2>
                    <p className="text-ink-400 text-sm">
                        Please wait while we connect to {provider}...
                    </p>
                </div>
            </div>
        </div>
    );
}
