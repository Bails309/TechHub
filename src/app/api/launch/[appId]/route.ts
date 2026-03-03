import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { getServerAuthSession } from '../../../../lib/auth';
import { writeAuditLog } from '../../../../lib/audit';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ appId: string }> }
) {
    const startTime = performance.now();
    const { appId } = await params;

    try {
        const session = await getServerAuthSession();

        // Find the app with a conditional filter:
        // If unauthenticated, we only allow fetching apps with a PUBLIC audience.
        // This prevents unauthenticated probing of private app IDs (Information Leakage Fix).
        const app = await prisma.appLink.findFirst({
            where: {
                id: appId,
                ...(session ? {} : { audience: 'PUBLIC' })
            },
        });

        if (!app) {
            // If not found or restricted, return 404 to avoid leaking ID existence
            return new NextResponse('App not found', { status: 404 });
        }

        // Read standard headers to determine trusted context
        const referer = request.headers.get('referer');
        const host = request.headers.get('host');

        let isTrustedReferer = false;
        if (referer && host) {
            try {
                const refererUrl = new URL(referer);
                // Simple origin check (port/protocol independent for local dev/Docker scenarios)
                // In production behind a proxy (like Azure Ingress), Host is preserved.
                if (refererUrl.host === host) {
                    isTrustedReferer = true;
                }
            } catch (e) {
                // Invalid referer URL, ignore
            }
        }

        const endTime = performance.now();
        const latency = Math.round(endTime - startTime);

        // Log the launch event with latency
        await writeAuditLog({
            category: 'admin', // Using admin category for app actions
            action: 'app_launch',
            actorId: session?.user?.id,
            targetId: app.id,
            latency,
            details: { name: app.name, url: app.url }
        });

        if (isTrustedReferer) {
            // Direct redirect from our own UI
            return NextResponse.redirect(new URL(app.url));
        } else {
            // Use NEXTAUTH_URL as the safe base origin if available to avoid Resolving to 0.0.0.0 in Docker.
            // This is secure against Open Redirects because the destination path is hardcoded.
            const origin = process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL).origin : request.nextUrl.origin;
            const confirmUrl = new URL(`/launch-confirm/${app.id}`, origin);
            return NextResponse.redirect(confirmUrl);
        }
    } catch (error) {
        console.error('[launch] Redirection error:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
