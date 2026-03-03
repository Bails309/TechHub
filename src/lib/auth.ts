import type { NextAuthOptions, Session, User, Account } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import AzureAD from 'next-auth/providers/azure-ad';
import Credentials from 'next-auth/providers/credentials';
import Keycloak from 'next-auth/providers/keycloak';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import type { Adapter, AdapterAccount } from 'next-auth/adapters';
import { z } from 'zod';
import { prisma } from './prisma';
import { verifyPassword } from './password';
import { assertRateLimit } from './rateLimit';
import { getServerSession } from 'next-auth';
import { getUserMeta } from './userCache';
import { getSsoConfigMap } from './sso';
import { writeAuditLog } from './audit';
import { getSharedRedisClient } from './redis';
import {
  getClientIp,
  isPrivateOrLocal,
  normalizeIp,
  type HeaderSource,
  readHeader,
  trustProxy,
  trustedProxiesEnv
} from './ip';

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
const allowEmailLinking = false;
const rateLimitFallbackAllowProxy = process.env.RATE_LIMIT_FALLBACK_ALLOW_PROXY === 'true';
const allowMissingRemoteIp = process.env.ALLOW_MISSING_REMOTE_IP === 'true';

// Session lifetime (OWASP baseline: 8-hour absolute, 20-minute idle)
function getSessionMaxAgeSeconds(): number {
  const env = process.env.SESSION_MAX_AGE_SECONDS;
  const val = env ? Number(env) : 28800; // 8 hours default
  return val > 0 ? val : 28800;
}

function getSessionIdleTimeoutMs(): number {
  const env = process.env.SESSION_IDLE_TIMEOUT_MS;
  const val = env ? Number(env) : 1200000; // 20 minutes default
  return val > 0 ? val : 1200000;
}

// Startup-time warning
if (!trustProxy && !trustedProxiesEnv && process.env.NODE_ENV === 'production') {
  console.warn('[AUTH] Warning: TRUST_PROXY is not enabled and TRUSTED_PROXIES is unset.');
}

const requirePreprovisionedUsers = process.env.REQUIRE_PREPROVISIONED_USERS === 'true';
const terminationLogCache = new Map<string, number>();

setInterval(() => {
  const now = Date.now();
  for (const [k, expiry] of terminationLogCache.entries()) {
    if (now > expiry) terminationLogCache.delete(k);
  }
}, 60_000).unref();

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
  terminationLogCache.set(key, Date.now() + 60_000);

  await writeAuditLog({
    category: 'auth',
    action: 'session_terminated',
    targetId: userId,
    details: { reason },
  });
}

let BASE_PRISMA_ADAPTER: Adapter | null = null;

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

      function extractRemoteAddr(r: unknown): string | undefined {
        if (!r || typeof r !== 'object') return undefined;
        const rec = r as Record<string, unknown>;
        const socket = rec.socket as Record<string, unknown> | undefined;
        if (socket && typeof socket.remoteAddress === 'string') return socket.remoteAddress;
        const connection = rec.connection as Record<string, unknown> | undefined;
        if (connection && typeof connection.remoteAddress === 'string') return connection.remoteAddress;
        if (typeof rec.ip === 'string') return rec.ip;
        return undefined;
      }

      const remoteAddr = extractRemoteAddr(req);
      const clientIp = getClientIp(req?.headers, remoteAddr);
      const emailKey = parsed.data.email.toLowerCase();

      if (!clientIp) {
        if (isPrivateOrLocal(remoteAddr) && rateLimitFallbackAllowProxy) {
          console.warn('auth: detected private remoteAddr %s while TRUST_PROXY=false; falling back to email-only rate limiting', remoteAddr);
        } else {
          console.error('auth: login rejected - missing client IP; remoteAddr=%s', remoteAddr ?? 'undefined');
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
        const ipKey = getRateLimitKey(req?.headers, undefined, remoteAddr);
        const userKey = getRateLimitKey(undefined, emailKey, undefined);
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

  return {
    adapter,
    secret: process.env.NEXTAUTH_SECRET,
    session: { strategy: 'jwt', maxAge: getSessionMaxAgeSeconds() },
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
        if (trigger === 'update') {
          if (typeof session?.user?.mustChangePassword === 'boolean') token.mustChangePassword = session.user.mustChangePassword;
          if (session?.user?.image !== undefined) token.image = session.user.image;
          if (session?.logoutReason) token.logoutReason = session.logoutReason;
        }

        if (user?.id) token.id = user.id;
        if (typeof user?.mustChangePassword === 'boolean') token.mustChangePassword = user.mustChangePassword;
        if (account?.provider) token.authProvider = account.provider;
        if (user?.image) token.image = user.image;
        if (user?.roles) token.roles = user.roles;

        // --- 1. Periodic Consistency Checks (DB/Cache) ---
        const JWT_CHECK_INTERVAL_MS = Number(process.env.JWT_CHECK_INTERVAL_MS ?? 300000);
        const lastChecked = Number(token.lastCheckedAt ?? 0);
        const shouldCheck = Math.abs(lastChecked - now) > 10 && (now - lastChecked > JWT_CHECK_INTERVAL_MS || token.mustChangePassword);

        if (token.sub && !token.revoked && shouldCheck) {
          try {
            const meta = (process.env.NODE_ENV === 'test' || process.env.DEBUG_AUTH === 'true') ? null : await getUserMeta(String(token.sub));
            if (!meta) {
              const userRecord = await prisma.user.findUnique({
                where: { id: String(token.sub) },
                select: {
                  roles: { include: { role: true } },
                  mustChangePassword: true,
                  updatedAt: true,
                  // @ts-ignore
                  securityStamp: true
                }
              });
              if (!userRecord) {
                console.warn('[AUTH] Revoking session for sub=%s (user_deleted)', token.sub);
                token.revoked = true;
                await writeAuditLog({ category: 'auth', action: 'session_terminated', targetId: String(token.sub), details: { reason: 'user_deleted' } });
              } else {
                const dbStamp = (userRecord as any).securityStamp ? new Date((userRecord as any).securityStamp).getTime() : 0;
                const tokenStamp = Number(token.securityStamp ?? 0);
                if (trigger !== 'update' && tokenStamp > 0 && dbStamp > tokenStamp) {
                  console.warn('[AUTH] Revoking session for sub=%s (security_stamp_mismatch: db=%d, token=%d)', token.sub, dbStamp, tokenStamp);
                  token.revoked = true;
                }
                token.roles = (userRecord as any).roles?.map((r: any) => r.role.name) ?? [];
                token.mustChangePassword = (userRecord as any).mustChangePassword;
                token.securityStamp = dbStamp || undefined;
                token.userUpdatedAt = new Date((userRecord as any).updatedAt).getTime();
                token.lastCheckedAt = now;
              }
            } else {
              token.roles = meta.roles;
              token.mustChangePassword = meta.mustChangePassword;
              token.securityStamp = meta.securityStamp;
              token.lastCheckedAt = now;
            }
          } catch (err) {
            console.error('[AUTH] Error during consistency check:', err);
          }
        }

        // --- 2. Session Lifetime Enforcement ---
        const issuedAt = Number(token.iat ?? 0);
        const lastActivity = Number(token.lastActivity ?? 0);

        // Absolute session timeout (e.g. 8 hours)
        const isAbsoluteTimeout = !token.revoked && issuedAt > 0 && (now - issuedAt * 1000) > getSessionMaxAgeSeconds() * 1000;
        if (isAbsoluteTimeout) {
          console.warn('[AUTH] Revoking session for sub=%s (absolute_timeout: iat=%d, now=%d, limit=%d)', token.sub, issuedAt, Math.floor(now / 1000), getSessionMaxAgeSeconds());
          token.revoked = true;
          await logSessionTerminationOnce(String(token.sub), 'absolute_timeout', issuedAt);
        }

        // Idle session timeout (e.g. 20 minutes)
        // Only enforce if we have a previous activity record (prevents kicking users on code deploy if field was missing)
        const isIdleTimeout = !token.revoked && lastActivity > 0 && (now - lastActivity) > getSessionIdleTimeoutMs();
        if (isIdleTimeout) {
          console.warn('[AUTH] Revoking session for sub=%s (idle_timeout: lastActivity=%d, now=%d, limit=%d)', token.sub, lastActivity, now, getSessionIdleTimeoutMs());
          token.revoked = true;
          await logSessionTerminationOnce(String(token.sub), 'idle_timeout', issuedAt);
        }

        // Update activity on every request if still valid
        if (!token.revoked) {
          token.lastActivity = now;
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
        if (token.revoked) session.revoked = true;
        return session;
      }
    },
    events: {
      async signIn({ user, account }) {
        await writeAuditLog({ category: 'auth', action: 'login_success', actorId: user?.id ?? null, provider: account?.provider ?? null, details: { email: user?.email ?? null } });
      },
      async signOut({ token }) {
        const reason = token?.logoutReason;
        if (reason === 'idle_timeout' || reason === 'absolute_timeout') {
          await writeAuditLog({ category: 'auth', action: 'session_terminated', targetId: token?.sub ?? null, details: { reason } });
          return;
        }
        if (token?.revoked) return;
        await writeAuditLog({ category: 'auth', action: 'logout', actorId: token?.sub ?? null });
      },
    },
    pages: { signIn: '/auth/signin' }
  };
}

export async function getServerAuthSession() {
  if (process.env.NODE_ENV === 'test' && process.env.UNSAFE_TEST_AUTH === 'true') {
    return { user: { id: 'admin', roles: ['admin'], authProvider: 'credentials', mustChangePassword: false } } as unknown as Session;
  }
  const options = await getAuthOptions();
  return getServerSession(options);
}
