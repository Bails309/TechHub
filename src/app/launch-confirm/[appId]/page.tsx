import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';

export default async function LaunchConfirmPage({
    params
}: {
    params: Promise<{ appId: string }>;
}) {
    const { appId } = await params;

    const app = await prisma.appLink.findUnique({
        where: { id: appId }
    });

    if (!app) {
        notFound();
    }

    // Extract just the domain for a cleaner specific warning
    let domain = app.url;
    try {
        domain = new URL(app.url).hostname;
    } catch (e) {
        // leave as full url if parsing fails
    }

    return (
        <div className="min-h-[70vh] flex flex-col items-center justify-center px-6 md:px-12 py-12">
            <div className="card-panel max-w-md mx-auto w-full p-8 md:p-10 text-center space-y-6">
                <div className="w-16 h-16 bg-amber-900/30 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>

                <h1 className="text-2xl font-bold text-ink-50">Leaving TechHub</h1>

                <p className="text-ink-200">
                    You are about to be redirected to an external application:
                </p>

                <div className="bg-ink-800 p-4 rounded-lg border border-ink-700">
                    <p className="font-semibold text-ink-50 truncate" title={app.name}>{app.name}</p>
                    <p className="text-sm text-ink-400 font-mono truncate mt-1" title={app.url}>{domain}</p>
                </div>

                <p className="text-sm text-ink-300">
                    This link was opened from outside the TechHub dashboard. Please confirm you want to proceed to this destination.
                </p>

                <div className="flex gap-4 pt-4">
                    <Link
                        href="/"
                        className="btn-secondary flex-1 justify-center"
                    >
                        Cancel
                    </Link>
                    <a
                        href={app.url}
                        className="btn-primary flex-1 justify-center"
                        rel="noopener noreferrer"
                    >
                        Proceed
                    </a>
                </div>
            </div>
        </div>
    );
}
