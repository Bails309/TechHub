import { prisma } from './prisma';

export type AuditCategory = 'auth' | 'admin' | 'config';

export interface AuditEntry {
    category: AuditCategory;
    action: string;
    actorId?: string | null;
    targetId?: string | null;
    provider?: string | null;
    ip?: string | null;
    details?: any;
}

/**
 * Write an entry to the audit log.
 *
 * Fire-and-forget — catches errors internally so callers are never
 * blocked by audit failures. Returns the created record in the happy
 * path (useful for tests) or `null` on failure.
 */
export async function writeAuditLog(entry: AuditEntry) {
    try {
        return await prisma.auditLog.create({
            data: {
                category: entry.category,
                action: entry.action,
                actorId: entry.actorId ?? null,
                targetId: entry.targetId ?? null,
                provider: entry.provider ?? null,
                ip: entry.ip ?? null,
                details: entry.details ?? undefined,
            },
        });
    } catch (err) {
        console.error('[audit] Failed to write audit log entry:', err);
        return null;
    }
}
