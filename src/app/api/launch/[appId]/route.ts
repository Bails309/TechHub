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

        // Redirect to the app URL
        return NextResponse.redirect(new URL(app.url));
    } catch (error) {
        console.error('[launch] Redirection error:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
