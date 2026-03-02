import ipaddr from 'ipaddr.js';
import { headers } from 'next/headers';

export const trustProxy = process.env.TRUST_PROXY === 'true';
export const trustedProxiesEnv = String(process.env.TRUSTED_PROXIES ?? '').trim();

// Parse TRUSTED_PROXIES into CIDR tuples using ipaddr.js
let trustedProxyCidrs: Array<[ipaddr.IPv4 | ipaddr.IPv6, number]> = [];
if (trustedProxiesEnv) {
    trustedProxyCidrs = trustedProxiesEnv
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

export function isFromTrustedProxy(remoteIp: string | undefined) {
    if (!remoteIp) return false;
    if (!trustedProxyCidrs.length) return false;
    try {
        const addr = ipaddr.parse(remoteIp);
        for (const cidr of trustedProxyCidrs) {
            if (addr.match(cidr)) return true;
        }
        return false;
    } catch {
        return false;
    }
}

export function isPrivateOrLocal(remoteIp: string | undefined) {
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
        return ipaddr.isValid(inside) ? ipaddr.process(inside).toString() : undefined;
    }

    // host:port formats (IPv4 or hostname with port)
    if (trimmed.includes(':') && trimmed.indexOf(':') === trimmed.lastIndexOf(':') && trimmed.includes('.')) {
        const withoutPort = trimmed.split(':')[0];
        return ipaddr.isValid(withoutPort) ? ipaddr.process(withoutPort).toString() : undefined;
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
 * Prioritizes X-Azure-ClientIP when TRUST_PROXY is enabled.
 */
export function getClientIp(headers: HeaderSource, remoteAddr?: string): string | undefined {
    const remoteNormalized = normalizeIp(remoteAddr);

    if (trustProxy) {
        // 1. Prioritize x-azure-clientip (Azure Container Apps / AFD / App Service)
        const azureIp = readHeader(headers, 'x-azure-clientip');
        if (azureIp) {
            const normalized = normalizeIp(azureIp);
            if (normalized) return normalized;
        }

        // 2. Fall back to x-forwarded-for (standard proxy header)
        const forwardedFor = readHeader(headers, 'x-forwarded-for');
        if (forwardedFor) {
            const parts = forwardedFor.split(',').map((s) => s.trim()).filter(Boolean);
            // Scan right-to-left to skip trusted proxies
            for (let i = parts.length - 1; i >= 0; i--) {
                const candidate = normalizeIp(parts[i]);
                if (!candidate) continue;
                if (isFromTrustedProxy(candidate)) continue;
                return candidate;
            }
        }

        // 3. Fall back to x-real-ip
        const realIp = readHeader(headers, 'x-real-ip');
        if (realIp) {
            const normalized = normalizeIp(realIp);
            if (normalized) return normalized;
        }
    }

    return remoteNormalized || (process.env.NODE_ENV === 'test' ? undefined : '127.0.0.1');
}

/**
 * Automatically captures the client IP in a Next.js Server Action or SSR context.
 */
export async function getServerActionIp(): Promise<string | undefined> {
    try {
        const headerList = await headers();
        // Next.js headers() handles the request context automatically.
        // We don't have direct access to the socket remoteAddr here, 
        // but getClientIp will fall back to local if headers are empty.
        return getClientIp(headerList);
    } catch (err) {
        // headers() might throw if called outside of a request context
        return undefined;
    }
}
