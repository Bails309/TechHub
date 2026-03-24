import type { NextAuthOptions, Session, User, Account } from 'next-auth';
import { headers } from 'next/headers';
import type { JWT } from 'next-auth/jwt';
import AzureAD from 'next-auth/providers/azure-ad';
import Credentials from 'next-auth/providers/credentials';
import Keycloak from 'next-auth/providers/keycloak';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import type { Adapter, AdapterAccount } from 'next-auth/adapters';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { prisma } from './prisma';
import { verifyPassword } from './password';
import { assertRateLimit } from './rateLimit';
import { getServerSession } from 'next-auth';
import { getUserMeta } from './userCache';
import { getSsoConfigMap } from './sso';
import { writeAuditLog } from './audit';
import { getSharedRedisClient } from './redis';
import { trackSession, untrackSession, refreshSession, clearAllSessions } from './sessionTracker';
import {
  getClientIp,
  isPrivateOrLocal,
  normalizeIp,
  type HeaderSource,
  readHeader,
  trustProxy,
  trustedProxiesEnv
} from './ip';
import { getSessionMaxAgeSeconds, getSessionIdleTimeoutMs } from './auth-config';

// Re-export for backward compatibility and consume from other modules
export {
  getClientIp,
  isPrivateOrLocal,
  normalizeIp,
  type HeaderSource,
  readHeader,
  trustProxy,
  trustedProxiesEnv
};

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const azureConfiguredEnv =
  Boolean(process.env.AZURE_AD_CLIENT_ID) &&
  Boolean(process.env.AZURE_AD_CLIENT_SECRET) &&
  Boolean(process.env.AZURE_AD_TENANT_ID);

const keycloakConfiguredEnv =
  Boolean(process.env.KEYCLOAK_CLIENT_ID) &&
  Boolean(process.env.KEYCLOAK_CLIENT_SECRET) &&
  Boolean(process.env.KEYCLOAK_ISSUER);

const credentialsEnabledEnv = process.env.ENABLE_CREDENTIALS !== 'false';
// Disabled by default to prevent account takeover via email matching.
// See: https://next-auth.js.org/configuration/providers/oauth#allowdangerousemailaccountlinking
const allowEmailLinking = false;
const rateLimitFallbackAllowProxy = process.env.RATE_LIMIT_FALLBACK_ALLOW_PROXY === 'true';

// Session lifetimes are now defined in auth-config.ts to be Edge-compatible
export { getSessionMaxAgeSeconds, getSessionIdleTimeoutMs };

// Startup-time warning
if (!trustProxy && !trustedProxiesEnv && process.env.NODE_ENV === 'production') {
  console.warn('[AUTH] Warning: TRUST_PROXY is not enabled and TRUSTED_PROXIES is unset.');
}

const requirePreprovisionedUsers = process.env.REQUIRE_PREPROVISIONED_USERS === 'true';
const terminationLogCache = new Map<string, number>();
const TERMINATION_CACHE_MAX = 1000;

// Serverless environments shouldn't use setInterval for memory caches as they don't fire reliably
// and prevent the event loop from closing. The Redis layer handles the deduplication primarily anyway.

function pruneTerminationCache() {
  if (terminationLogCache.size <= TERMINATION_CACHE_MAX) return;
  const now = Date.now();
  for (const [k, expiry] of terminationLogCache) {
    if (expiry < now) terminationLogCache.delete(k);
  }
}

async function logSessionTerminationOnce(userId: string, reason: string, issuedAt: number) {
  const key = `audit:termination:${userId}:${reason}:${issuedAt}`;
  const client = await getSharedRedisClient();
  if (client) {
    try {
      const result = await client.set(key, '1', 'EX', 60, 'NX');
      if (result !== 'OK') return;
    } catch (err) {
      console.warn('[AUTH] Redis termination dedupe failed, falling back to memory', err);
    }
  }
  if (terminationLogCache.has(key)) return;
  pruneTerminationCache();
  terminationLogCache.set(key, Date.now() + 60_000);

  await writeAuditLog({
    category: 'auth',
    action: 'session_terminated',
    targetId: userId,
    details: { reason },
  });
}

let BASE_PRISMA_ADAPTER: Adapter | null = null;
let cachedAuthOptions: { value: NextAuthOptions; expiresAt: number } | null = null;
const AUTH_OPTIONS_CACHE_TTL_MS = 60_000;

export function getRateLimitKey(headers: HeaderSource, fallbackKey?: string, remoteAddr?: string) {
  const ip = getClientIp(headers, remoteAddr);
  const emailKey = fallbackKey ? fallbackKey.toLowerCase() : undefined;
  if (ip && emailKey) return `ip:${ip}|user:${emailKey}`;
  if (ip) return `ip:${ip}`;
  return emailKey ? `user:${emailKey}` : 'unknown';
}

function buildCredentialsProvider() {
  return Credentials({
    name: 'Credentials',
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Password', type: 'password' }
    },
    async authorize(credentials, req) {
      const parsed = credentialsSchema.safeParse(credentials);
      if (!parsed.success) return null;

      const hdrs = await headers();
      const clientIp = getClientIp(hdrs);
      const emailKey = parsed.data.email.toLowerCase();

      if (!clientIp) {
        if (rateLimitFallbackAllowProxy) {
          console.warn('auth: missing client IP; falling back to email-only rate limiting');
        } else {
          console.error('auth: login rejected - missing client IP');
          writeAuditLog({
            category: 'auth',
            action: 'login_failure',
            provider: 'credentials',
            details: { reason: 'missing_client_ip' },
          });
          return null;
        }
      }

      try {
        const ipKey = getRateLimitKey(hdrs, undefined);
        const userKey = getRateLimitKey(undefined, emailKey);
        if (clientIp) await assertRateLimit(ipKey);
        await assertRateLimit(userKey);
      } catch {
        console.warn('auth: login rejected - rate limited email=%s ip=%s', emailKey, clientIp ?? 'none');
        writeAuditLog({
          category: 'auth',
          action: 'login_failure',
          provider: 'credentials',
          ip: clientIp,
          details: { email: emailKey, reason: 'rate_limited' },
        });
        return null;
      }

      const user = await prisma.user.findUnique({
        where: { email: emailKey },
        include: { roles: { include: { role: true } } }
      });

      if (!user?.passwordHash) {
        // Perform a dummy bcrypt compare to prevent timing-based user enumeration.
        // Without this, an attacker could distinguish "user not found" (~0ms)
        // from "wrong password" (~100ms bcrypt) by measuring response time.
        await verifyPassword(parsed.data.password, '$2a$12$000000000000000000000uGWDMwHSaLiDkMtIaguvW5pMyMqOZITW');
        writeAuditLog({
          category: 'auth',
          action: 'login_failure',
          provider: 'credentials',
          ip: clientIp,
          details: { email: emailKey, reason: 'invalid_credentials' },
        });
        return null;
      }

      const valid = await verifyPassword(parsed.data.password, user.passwordHash);
      if (!valid) {
        writeAuditLog({
          category: 'auth',
          action: 'login_failure',
          provider: 'credentials',
          ip: clientIp,
          details: { email: emailKey, reason: 'invalid_credentials' },
        });
        return null;
      }

      return {
        id: user.id,
        name: user.name ?? undefined,
        email: user.email ?? undefined,
        image: user.image ?? undefined,
        roles: user.roles.map((item) => item.role.name),
        mustChangePassword: user.mustChangePassword,
        authProvider: 'credentials'
      };
    }
  });
}

export async function getAuthOptions(): Promise<NextAuthOptions> {
  const now = Date.now();
  if (cachedAuthOptions && cachedAuthOptions.expiresAt > now) return cachedAuthOptions.value;
  const ssoConfigs = await getSsoConfigMap();
  const providers = [] as NextAuthOptions['providers'];
  const baseAdapter = BASE_PRISMA_ADAPTER ?? (BASE_PRISMA_ADAPTER = PrismaAdapter(prisma));
  const adapter: Adapter = {
    ...baseAdapter,
    async linkAccount(account: AdapterAccount) {
      const raw = account as Record<string, unknown>;
      const rest = Object.fromEntries(
        Object.entries(raw).filter(([key]) => key !== 'not-before-policy')
      );
      return baseAdapter.linkAccount?.(rest as AdapterAccount);
    }
  };

  const azureConfig = ssoConfigs.get('azure-ad');
  if (azureConfig?.enabled) {
    providers.push(AzureAD({
      clientId: String(azureConfig.config?.clientId ?? ''),
      clientSecret: azureConfig.clientSecret ?? '',
      tenantId: String(azureConfig.config?.tenantId ?? ''),
      allowDangerousEmailAccountLinking: allowEmailLinking
    }));
  } else if (azureConfiguredEnv) {
    providers.push(AzureAD({
      clientId: process.env.AZURE_AD_CLIENT_ID ?? '',
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET ?? '',
      tenantId: process.env.AZURE_AD_TENANT_ID ?? '',
      allowDangerousEmailAccountLinking: allowEmailLinking
    }));
  }

  const keycloakConfig = ssoConfigs.get('keycloak');
  if (keycloakConfig?.enabled) {
    providers.push(Keycloak({
      clientId: String(keycloakConfig.config?.clientId ?? ''),
      clientSecret: keycloakConfig.clientSecret ?? '',
      issuer: String(keycloakConfig.config?.issuer ?? ''),
      allowDangerousEmailAccountLinking: allowEmailLinking
    }));
  } else if (keycloakConfiguredEnv) {
    providers.push(Keycloak({
      clientId: process.env.KEYCLOAK_CLIENT_ID ?? '',
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET ?? '',
      issuer: process.env.KEYCLOAK_ISSUER ?? '',
      allowDangerousEmailAccountLinking: allowEmailLinking
    }));
  }

  if (ssoConfigs.get('credentials')?.enabled ?? credentialsEnabledEnv) {
    providers.push(buildCredentialsProvider());
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log('[AUTH] Final providers list:', providers.map(p => p.id));
  }

  const opts: NextAuthOptions = {
    adapter,
    secret: process.env.NEXTAUTH_SECRET,
    session: { strategy: 'jwt', maxAge: getSessionMaxAgeSeconds(), updateAge: 60 },
    providers,
    callbacks: {
      async signIn({ user, account, profile }) {
        if (account?.provider && account.provider !== 'credentials') {
          if (!user?.email) return false;
          const existing = await prisma.user.findUnique({ where: { email: user.email } });
          if (requirePreprovisionedUsers && !existing) return false;
          const accountExists = account?.providerAccountId ? await prisma.account.findUnique({
            where: { provider_providerAccountId: { provider: account.provider, providerAccountId: account.providerAccountId } }
          }) : null;
          if (!accountExists && existing) return false;
        }
        return true;
      },
      async jwt({ token, user, account, trigger, session }: any) {
        const now = Date.now();
        // Ensure every token has a unique JTI (required for session tracking + blacklist)
        if (!token.jti) token.jti = randomUUID();

        // Stable session identifier for the concurrent-session tracker.
        // NextAuth v4's encode() calls .setJti(uuid()) internally, which
        // overwrites token.jti with a NEW UUID on every encode cycle.
        // That means token.jti changes on every request, making it useless
        // as a sorted-set member.  token.sessionId is a custom field that
        // the encoder won't touch, so it stays constant for the entire
        // session lifetime.
        if (!token.sessionId) token.sessionId = randomUUID();

        if (trigger === 'update') {
          if (typeof session?.user?.mustChangePassword === 'boolean') token.mustChangePassword = session.user.mustChangePassword;
          if (session?.user?.image !== undefined) token.image = session.user.image;
          if (session?.logoutReason) token.logoutReason = session.logoutReason;

          // "Clear other sessions" — wipe all Redis entries and re-register only this one
          if (session?.clearSessions && token.sub && token.sessionId) {
            try {
              await clearAllSessions(String(token.sub));
              const expiresAtMs = (Number(token.exp ?? 0) * 1000) || (now + getSessionMaxAgeSeconds() * 1000);
              await trackSession(String(token.sub), String(token.sessionId), expiresAtMs);
              token.concurrentSessions = 0;
              if (process.env.NODE_ENV === 'production') {
                console.log('[AUTH] clearSessions: sub=%s — cleared and re-registered sessionId=%s', token.sub, token.sessionId);
              }
            } catch (err) {
              console.warn('[AUTH] clearSessions failed for sub=%s', token.sub, err);
            }
          }
        }

        if (user?.id) token.id = user.id;
        if (typeof user?.mustChangePassword === 'boolean') token.mustChangePassword = user.mustChangePassword;
        if (account?.provider) token.authProvider = account.provider;
        if (user?.image) token.image = user.image;
        if (user?.roles) token.roles = user.roles;

        // Track new session in Redis on initial sign-in (when user object is present)
        if (user?.id && token.sessionId) {
          const expiresAtMs = (Number(token.exp ?? 0) * 1000) || (now + getSessionMaxAgeSeconds() * 1000);
          const hdrs = await headers().catch(() => null);
          const loginIp = hdrs ? getClientIp(hdrs as any) : null;
          try {
            const activeCount = await trackSession(user.id, String(token.sessionId), expiresAtMs, loginIp, account?.provider);
            token.concurrentSessions = activeCount > 1 ? activeCount : 0;
            if (process.env.NODE_ENV === 'production') {
              console.log('[AUTH] trackSession: userId=%s sessionId=%s activeCount=%d concurrentSessions=%d', user.id, token.sessionId, activeCount, token.concurrentSessions);
            }
          } catch (err) {
            console.warn('[AUTH] trackSession failed for userId=%s', user.id, err);
          }
        }

        // --- 1. Periodic Consistency Checks (DB/Cache) ---
        const JWT_CHECK_INTERVAL_MS = Number(process.env.JWT_CHECK_INTERVAL_MS ?? 300000);
        const lastChecked = Number(token.lastCheckedAt ?? 0);
        // FIX 3: Remove || token.mustChangePassword from the interval check. 
        const shouldCheck = Math.abs(lastChecked - now) > 10 && (now - lastChecked > JWT_CHECK_INTERVAL_MS);

        if (token.sub && !token.revoked) {
          const client = await getSharedRedisClient();

          // FIX 1: Stateless JWT Blacklist check (Replay Protection)
          if (client && token.jti) {
            try {
              const isBlacklisted = await client.get(`auth:blacklist:${token.jti}`);
              if (isBlacklisted) {
                console.warn('[AUTH] Blocking blacklisted token jti=%s sub=%s', token.jti, token.sub);
                token.revoked = true;
              }
            } catch (err) {
              console.warn('[AUTH] Redis blacklist check failed', err);
            }
          }

          if (!token.revoked && shouldCheck) {
            try {
              const meta = await getUserMeta(String(token.sub));
              if (!meta) {
                console.warn('[AUTH] Revoking session for sub=%s (user_deleted)', token.sub);
                token.revoked = true;
                await writeAuditLog({ category: 'auth', action: 'session_terminated', targetId: String(token.sub), details: { reason: 'user_deleted' } });
              } else {
                const dbStamp = meta.securityStamp ? new Date(meta.securityStamp).getTime() : 0;
                const tokenStamp = Number(token.securityStamp ?? 0);
                if (trigger !== 'update' && tokenStamp > 0 && dbStamp > tokenStamp) {
                  console.warn('[AUTH] Revoking session for sub=%s (security_stamp_mismatch: db=%d, token=%d)', token.sub, dbStamp, tokenStamp);
                  token.revoked = true;
                }
                token.roles = meta.roles ?? [];
                token.mustChangePassword = meta.mustChangePassword;
                token.securityStamp = dbStamp || undefined;
                token.userUpdatedAt = meta.updatedAt;
                token.lastCheckedAt = now;
              }
            } catch (err) {
              console.error('[AUTH] Error during consistency check:', err);
            }
          }

          // Concurrent-session heartbeat: runs frequently but not on every
          // single request.  60s throttle balances responsiveness with Redis load.
          // Uses token.sessionId (stable) instead of token.jti (rotated by encode).
          const SESSION_REFRESH_INTERVAL_MS = 60_000; // 1 minute
          const lastSessionRefresh = Number(token.lastSessionRefreshAt ?? 0);
          if (!token.revoked && token.sessionId && !user?.id && (now - lastSessionRefresh > SESSION_REFRESH_INTERVAL_MS)) {
            try {
              const activeCount = await refreshSession(String(token.sub), String(token.sessionId));
              // activeCount >= 1 means Redis responded (at least this session exists).
              // 0 means Redis was unavailable — preserve the existing value so a
              // transient Redis blip doesn't hide the concurrent-session banner.
              if (activeCount >= 1) {
                token.concurrentSessions = activeCount > 1 ? activeCount : 0;
              }
              token.lastSessionRefreshAt = now;
              if (process.env.NODE_ENV === 'production') {
                console.log('[AUTH] refreshSession: sub=%s sessionId=%s activeCount=%d concurrentSessions=%d', token.sub, token.sessionId, activeCount, token.concurrentSessions ?? 0);
              }
            } catch {
              // Non-critical — leave previous value
            }
          }

          // --- 2. Session Lifetime Enforcement ---
          const issuedAt = Number(token.iat ?? 0);
          const isAbsoluteTimeout = !token.revoked && issuedAt > 0 && (now - issuedAt * 1000) > getSessionMaxAgeSeconds() * 1000;
          if (isAbsoluteTimeout) {
            console.warn('[AUTH] Revoking session for sub=%s (absolute_timeout: iat=%d, now=%d, limit=%d)', token.sub, issuedAt, Math.floor(now / 1000), getSessionMaxAgeSeconds());
            token.revoked = true;
            await logSessionTerminationOnce(String(token.sub), 'absolute_timeout', issuedAt);
          }

          // If newly revoked, ensure we blacklist the JTI in Redis to prevent replay
          if (token.revoked && token.jti) {
            const client = await getSharedRedisClient();
            if (client) {
              const ttl = Math.max(0, Math.floor((Number(token.exp ?? 0) * 1000 - now) / 1000));
              if (ttl > 0) {
                await client.set(`auth:blacklist:${token.jti}`, '1', 'EX', ttl).catch(() => null);
              }
            }
            // Remove revoked session from the concurrent-session tracker
            if (token.sub && token.sessionId) {
              untrackSession(String(token.sub), String(token.sessionId)).catch(() => null);
            }
          }
        }

        // Diagnostic: always log the session-tracking state leaving the JWT callback
        if (token.sub && (token.concurrentSessions || user?.id)) {
          console.log('[AUTH] jwt-done: sub=%s sessionId=%s concurrentSessions=%d hasUser=%s trigger=%s',
            token.sub, token.sessionId, token.concurrentSessions ?? 0, !!user?.id, trigger ?? 'none');
        }

        return token;
      },
      async session({ session, token }: any) {
        if (session.user) {
          session.user.id = token.sub ?? session.user.id;
          session.user.authProvider = token.authProvider ?? undefined;
          const sub = String(token.sub ?? '');
          if (sub) {
            try {
              const meta = await Promise.race([getUserMeta(sub), new Promise((res) => setTimeout(() => res(null), 2000))]) as any;
              if (meta) {
                session.user.roles = meta.roles ?? [];
                session.user.image = meta.image ?? session.user.image;
                session.user.mustChangePassword = token.mustChangePassword === false ? false : (meta.mustChangePassword ?? false);
              } else {
                session.user.roles = token.roles ?? [];
                session.user.mustChangePassword = token.mustChangePassword ?? false;
                session.user.image = token.image ?? session.user.image;
              }
            } catch {
              session.user.roles = token.roles ?? [];
              session.user.mustChangePassword = token.mustChangePassword ?? false;
            }
          }
        }
        session.idleTimeoutMs = getSessionIdleTimeoutMs();
        if (token.concurrentSessions) session.concurrentSessions = token.concurrentSessions;
        if (token.revoked) session.revoked = true;

        // Diagnostic: log what the client will receive
        if (session.concurrentSessions || token.concurrentSessions) {
          console.log('[AUTH] session-response: sub=%s concurrentSessions=%d (token had %d)',
            token.sub, session.concurrentSessions ?? 0, token.concurrentSessions ?? 0);
        }

        return session;
      }
    },
    events: {
      async signIn({ user, account }: any) {
        await writeAuditLog({ category: 'auth', action: 'login_success', actorId: user?.id ?? null, provider: account?.provider ?? null, details: { email: user?.email ?? null } });
      },
      async signOut({ token }: any) {
        console.log('[AUTH] signOut event fired: sub=%s sessionId=%s logoutReason=%s revoked=%s', token?.sub, token?.sessionId, token?.logoutReason, token?.revoked);
        // Always remove from concurrent-session tracker regardless of
        // signOut reason (explicit logout, idle timeout, revocation).
        // Uses token.sessionId (stable) instead of token.jti (rotated by NextAuth encode).
        if (token?.sessionId && token?.sub) {
          await untrackSession(String(token.sub), String(token.sessionId)).catch((err: unknown) => {
            console.warn('[AUTH] untrackSession failed on signOut sessionId=%s', token.sessionId, err);
          });
        } else {
          console.warn('[AUTH] signOut: missing sessionId=%s or sub=%s — cannot untrack', token?.sessionId, token?.sub);
        }

        const reason = token?.logoutReason;
        if (reason === 'idle_timeout' || reason === 'absolute_timeout') {
          await writeAuditLog({ category: 'auth', action: 'session_terminated', targetId: token?.sub ?? null, details: { reason } });
          return;
        }
        if (token?.revoked) return;

        // Blacklist the JWT on explicit logout to prevent replay of stolen tokens
        if (token?.jti) {
          const client = await getSharedRedisClient();
          if (client) {
            const now = Date.now();
            const exp = Number(token.exp ?? 0) * 1000;
            const ttl = Math.max(0, Math.floor((exp - now) / 1000));
            if (ttl > 0) {
              await client.set(`auth:blacklist:${token.jti}`, '1', 'EX', ttl).catch(() => null);
            }
          }
        }

        await writeAuditLog({ category: 'auth', action: 'logout', actorId: token?.sub ?? null });
      },
    },
    pages: { signIn: '/auth/signin' }
  };
  cachedAuthOptions = { value: opts, expiresAt: Date.now() + AUTH_OPTIONS_CACHE_TTL_MS };
  return opts;
}

export async function getServerAuthSession() {
  if (process.env.NODE_ENV === 'test' && process.env.UNSAFE_TEST_AUTH === 'true') {
    return { user: { id: 'admin', roles: ['admin'], authProvider: 'credentials', mustChangePassword: false } } as unknown as Session;
  }
  const options = await getAuthOptions();
  return getServerSession(options);
}
