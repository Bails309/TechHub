import { prisma } from './prisma';
import { getServerActionIp } from './ip';

export type AuditCategory = 'auth' | 'admin' | 'config';

export interface AuditEntry {
    category: AuditCategory;
    action: string;
    actorId?: string | null;
    targetId?: string | null;
    provider?: string | null;
    ip?: string | null;
    latency?: number | null;
    details?: any;
}

let lastCleanupAt = 0;
let cleanupInFlight: Promise<void> | null = null;

/**
 * Write an entry to the audit log.
 *
 * Fire-and-forget — catches errors internally so callers are never
 * blocked by audit failures. Returns the created record in the happy
 * path (useful for tests) or `null` on failure.
 */
export async function writeAuditLog(entry: AuditEntry) {
    try {
        // Automatically capture the IP from headers if not explicitly provided.
        // This ensures Server Actions capture the correct client IP without
        // needing to modify every caller.
        let clientIp = entry.ip;
        if (!clientIp) {
            clientIp = await getServerActionIp();
        }

        const result = await prisma.auditLog.create({
            data: {
                category: entry.category,
                action: entry.action,
                actorId: entry.actorId ?? null,
                targetId: entry.targetId ?? null,
                provider: entry.provider ?? null,
                ip: clientIp ?? null,
                latency: entry.latency ?? null,
                details: entry.details ?? undefined,
            },
        });

        const now = Date.now();
        const cleanupIntervalMs = 60 * 60 * 1000; // 1 hour
        if (now - lastCleanupAt > cleanupIntervalMs && !cleanupInFlight) {
            lastCleanupAt = now;
            cleanupInFlight = cleanupAuditLogs().finally(() => {
                cleanupInFlight = null;
            });
            void cleanupInFlight;
        }

        return result;
    } catch (err) {
        console.error('[audit] Failed to write audit log entry:', err);
        return null;
    }
}

async function cleanupAuditLogs() {
    try {
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        await prisma.auditLog.deleteMany({
            where: {
                createdAt: {
                    lt: ninetyDaysAgo
                }
            }
        });
    } catch (err) {
        console.error('[audit] Failed to clean up audit logs:', err);
    }
}

/**
 * Calculates the average latency of recent app launches.
 * Returns the average in ms, or null if no launches found.
 */
export async function getAverageLatency(limit = 100) {
    try {
        const logs = await prisma.auditLog.findMany({
            select: { latency: true },
            where: {
                action: 'app_launch',
                latency: { not: null }
            },
            orderBy: { createdAt: 'desc' },
            take: limit
        });

        if (logs.length === 0) return null;

        const sum = logs.reduce((acc, log) => acc + (log.latency || 0), 0);
        return Math.round(sum / logs.length);
    } catch (err) {
        console.error('[audit] Failed to calculate average latency:', err);
        return null;
    }
}
