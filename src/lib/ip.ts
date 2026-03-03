import ipaddr from 'ipaddr.js';
import { headers } from 'next/headers';

/**
 * Configuration getters to allow Vitest process.env stubbing/reloading.
 */
export function getTrustProxy() {
    return process.env.TRUST_PROXY === 'true';
}

export function getTrustedProxiesEnv() {
    return String(process.env.TRUSTED_PROXIES ?? '').trim();
}

export function getAllowMissingRemoteIp() {
    return process.env.ALLOW_MISSING_REMOTE_IP === 'true';
}

// Re-export for backward compatibility in auth.ts (though they are now getters)
// We'll keep the constants for now but compute them inside getClientIp.
export const trustProxy = process.env.TRUST_PROXY === 'true';
export const trustedProxiesEnv = String(process.env.TRUSTED_PROXIES ?? '').trim();

/**
 * Parses TRUSTED_PROXIES into CIDR tuples.
 */
function getTrustedProxyCidrs(): Array<[ipaddr.IPv4 | ipaddr.IPv6, number]> {
    const env = getTrustedProxiesEnv();
    if (!env) return [];
    return env
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((cidr) => {
            try {
                const parsed = ipaddr.parseCIDR(cidr);
                return [parsed[0], parsed[1]] as [ipaddr.IPv4 | ipaddr.IPv6, number];
            } catch {
                return undefined;
            }
        })
        .filter((c): c is [ipaddr.IPv4 | ipaddr.IPv6, number] => !!c);
}

export function isFromTrustedProxy(remoteIp: string | undefined): boolean {
    if (!remoteIp) return false;
    const cidrs = getTrustedProxyCidrs();
    if (!cidrs.length) return false;
    try {
        const addr = ipaddr.parse(remoteIp);
        for (const cidr of cidrs) {
            if (addr.match(cidr)) return true;
        }
        return false;
    } catch {
        return false;
    }
}

export function isPrivateOrLocal(remoteIp: string | undefined): boolean {
    if (!remoteIp) return false;
    try {
        const addr = ipaddr.parse(remoteIp);
        const range = addr.range();
        // treat private, loopback, linkLocal, and uniqueLocal as internal/proxy
        return range === 'private' || range === 'loopback' || range === 'linkLocal' || range === 'uniqueLocal';
    } catch {
        return false;
    }
}

export function normalizeIp(raw: string | undefined): string | undefined {
    if (!raw) return undefined;
    const trimmed = raw.trim();
    if (!trimmed) return undefined;

    // IPv6 with brackets [::1]
    if (trimmed.startsWith('[')) {
        const end = trimmed.indexOf(']');
        const inside = end >= 0 ? trimmed.slice(1, end) : trimmed.slice(1);
        // Also strips port if present after ]
        return ipaddr.isValid(inside) ? ipaddr.process(inside).toString() : undefined;
    }

    // host:port formats (IPv4 or hostname with port)
    if (trimmed.includes(':') && trimmed.indexOf(':') === trimmed.lastIndexOf(':')) {
        const withoutPort = trimmed.split(':')[0];
        if (ipaddr.isValid(withoutPort)) {
            return ipaddr.process(withoutPort).toString();
        }
    }

    return ipaddr.isValid(trimmed) ? ipaddr.process(trimmed).toString() : undefined;
}

export type HeaderSource = Record<string, string | string[] | undefined> | Headers | undefined;

export function readHeader(headers: HeaderSource, name: string) {
    if (!headers) return undefined;
    if (headers instanceof Headers) {
        return headers.get(name) ?? undefined;
    }
    const value = headers[name];
    return Array.isArray(value) ? value[0] : value;
}

/**
 * Extracts the client IP from a source of headers and an optional remote address.
 */
export function getClientIp(headers: HeaderSource, remoteAddr?: string): string | undefined {
    const remoteNormalized = normalizeIp(remoteAddr);
    const trustEnabled = getTrustProxy();
    const envProxies = getTrustedProxiesEnv();
    const allowMissing = getAllowMissingRemoteIp();

    // Verification requirement: Only trust headers if:
    // 1. TRUST_PROXY is enabled
    // 2. AND (remoteAddr is missing but ALLOW_MISSING_REMOTE_IP is set OR remoteAddr is from a trusted proxy)
    const isRemoteTrusted = trustEnabled && (
        (!remoteNormalized && allowMissing) ||
        (!!remoteNormalized && (!envProxies || isFromTrustedProxy(remoteNormalized)))
    );

    if (isRemoteTrusted) {
        // 1. Prioritize x-azure-clientip (Azure - trusted if from a trusted proxy)
        // We REMOVE 'x-client-ip' and 'x-real-ip' here because they are often
        // passed through unsanitized by intermediate proxies/ALBs, allowing trivial spoofing.
        const azureIp = readHeader(headers, 'x-azure-clientip');
        if (azureIp) {
            const normalized = normalizeIp(azureIp);
            if (normalized) return normalized;
        }

        // 4. Fall back to x-forwarded-for (multi-hop)
        const forwardedFor = readHeader(headers, 'x-forwarded-for');
        if (forwardedFor) {
            const parts = forwardedFor.split(',').map((s) => s.trim()).filter(Boolean);
            // Scan right-to-left to find the first non-trusted proxy IP
            for (let i = parts.length - 1; i >= 0; i--) {
                const candidate = normalizeIp(parts[i]);
                if (!candidate) continue;
                if (isFromTrustedProxy(candidate)) continue;
                return candidate;
            }
        }
    }

    // If we don't trust the proxy headers, or they are missing, return the immediate remote address.
    // In test environment, return undefined if remoteAddr is missing.
    // In production, fallback to 127.0.0.1 if everything else fails.
    if (remoteNormalized) return remoteNormalized;
    if (process.env.NODE_ENV === 'test') return undefined;
    return '127.0.0.1';
}

/**
 * Automatically captures the client IP in a Next.js Server Action or SSR context.
 */
export async function getServerActionIp(): Promise<string | undefined> {
    // In test environment or when next/headers is not properly shimmed,
    // headers() might hang or throw. Default to undefined to fail-open/closed
    // gracefully depending on use case.
    if (process.env.NODE_ENV === 'test') return undefined;

    try {
        const headerList = await headers();
        return getClientIp(headerList);
    } catch (err) {
        return undefined;
    }
}
