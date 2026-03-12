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

        // Find the app and its access requirements
        const app = await prisma.appLink.findUnique({
            where: { id: appId },
            include: {
                roles: { select: { name: true } },
                userAccesses: {
                    where: session?.user?.id ? { userId: session.user.id } : { userId: 'none' },
                    select: { userId: true }
                }
            }
        });

        if (!app) {
            return new NextResponse('App not found', { status: 404 });
        }

        // --- Permission Check ---
        let hasAccess = false;

        if (app.audience === 'PUBLIC') {
            hasAccess = true;
        } else if (session) {
            if (app.audience === 'AUTHENTICATED') {
                hasAccess = true;
            } else if (app.audience === 'ROLE') {
                const userRoles = session.user.roles || [];
                const allowedRoles = app.roles.map(r => r.name);
                hasAccess = userRoles.some(r => allowedRoles.includes(r)) || userRoles.includes('admin');
            } else if (app.audience === 'USER') {
                hasAccess = app.userAccesses.length > 0 || (session.user.roles || []).includes('admin');
            }
        }

        if (!hasAccess) {
            // Return 404 to avoid leaking existence of private apps
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

        let targetUrl: URL | null = null;
        try {
            const parsed = new URL(app.url);
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                targetUrl = parsed;
            }
        } catch {
            targetUrl = null;
        }

        if (!targetUrl) {
            return new NextResponse('Invalid app URL', { status: 400 });
        }

        if (isTrustedReferer) {
            // Direct redirect from our own UI
            return NextResponse.redirect(targetUrl);
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
