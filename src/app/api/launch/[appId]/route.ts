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

        // Find the app
        const app = await prisma.appLink.findUnique({
            where: { id: appId },
        });

        if (!app) {
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
            // Untrusted referer or direct link -- enforce confirmation interstitial
            // Use the standard Host header (set by browser/proxy, safe) — NOT x-forwarded-host (spoofable).
            // Derive protocol from NEXTAUTH_URL (admin-configured, not user-spoofable).
            const hostHeader = request.headers.get('host') ?? request.nextUrl.host;
            let proto = 'http';
            try { proto = new URL(process.env.NEXTAUTH_URL ?? '').protocol.replace(':', ''); } catch { };
            const confirmUrl = new URL(`/launch-confirm/${app.id}`, `${proto}://${hostHeader}`);
            return NextResponse.redirect(confirmUrl);
        }
    } catch (error) {
        console.error('[launch] Redirection error:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
