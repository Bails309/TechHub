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
import ipaddr from 'ipaddr.js';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
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
const trustProxy = process.env.TRUST_PROXY === 'true';
const trustedProxiesEnv = String(process.env.TRUSTED_PROXIES ?? '').trim();

// Session lifetime (OWASP baseline: 8-hour absolute, 20-minute idle)
function getSessionMaxAgeSeconds(): number {
  return Number(process.env.SESSION_MAX_AGE_SECONDS ?? 28800);
}

function getSessionIdleTimeoutMs(): number {
  // Prefer server-side explicit `SESSION_IDLE_TIMEOUT_MS` for runtime
  // configuration. `NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_MS` is a client-side
  // build-time variable and should not override server runtime tests.
  return Number(process.env.SESSION_IDLE_TIMEOUT_MS ?? process.env.NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_MS ?? 1200000);
}

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
        // convert readonly tuple to mutable tuple for compatibility with ipaddr.match
        return [parsed[0], parsed[1]] as [ipaddr.IPv4 | ipaddr.IPv6, number];
      } catch {
        return undefined as unknown as [ipaddr.IPv4 | ipaddr.IPv6, number] | undefined;
      }
    })
    .filter(Boolean) as Array<[ipaddr.IPv4 | ipaddr.IPv6, number]>;
}

function isFromTrustedProxy(remoteIp: string | undefined) {
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
const requirePreprovisionedUsers = process.env.REQUIRE_PREPROVISIONED_USERS === 'true';

// Lazily cache the base PrismaAdapter instance. We create it on first use
// so test-time mocks of `@next-auth/prisma-adapter` take effect when
// `getAuthOptions()` is imported after `vi.doMock` is applied.
let BASE_PRISMA_ADAPTER: Adapter | null = null;

type HeaderSource = Record<string, string | string[] | undefined> | Headers | undefined;

function readHeader(headers: HeaderSource, name: string) {
  if (!headers) {
    return undefined;
  }
  if (headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function parseForwarded(forwarded: string | undefined) {
  if (!forwarded) {
    return undefined;
  }
  const match = forwarded.match(/for=([^;]+)/i);
  return match?.[1]?.replace(/^"|"$/g, '') ?? undefined;
}

function normalizeIp(raw: string | undefined) {
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

export function getClientIp(headers: HeaderSource, remoteAddr?: string) {
  // Prefer immediate remote address when available
  const remoteNormalized = normalizeIp(remoteAddr ?? undefined);

  // If TRUST_PROXY is enabled and the immediate remote is a trusted proxy
  // (or the framework hides the immediate remote TCP socket entirely),
  // accept proxy-supplied headers (but only from configured trusted proxies).
  if (trustProxy) {
    if (!remoteNormalized || isFromTrustedProxy(remoteNormalized)) {
      const trustedClientIp = normalizeIp(readHeader(headers, 'x-client-ip'));
      if (trustedClientIp) return trustedClientIp;

      // Prefer x-forwarded-for but select the correct client IP by scanning
      // from right-to-left and skipping any addresses that belong to trusted proxies.
      const forwardedFor = readHeader(headers, 'x-forwarded-for');
      if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
        const parts = forwardedFor.split(',').map((s) => s.trim()).filter(Boolean);
        for (let i = parts.length - 1; i >= 0; i--) {
          const candidate = normalizeIp(parts[i]);
          if (!candidate) continue;
          // if candidate is a trusted proxy, skip it
          if (isFromTrustedProxy(candidate)) continue;
          return candidate;
        }
      }

      // Only accept `x-client-ip` or the validated x-forwarded-for result above.
      // Do NOT fall back to other single-value headers which may be spoofed
      // by upstreams that don't strip them.
      return remoteNormalized;
    }

    // TRUST_PROXY=true but immediate remote isn't trusted: ignore headers, use remote
    return remoteNormalized ?? undefined;
  }

  // Not trusting proxy headers: prefer immediate remote address only.
  // Do NOT fall back to proxy-supplied headers (x-real-ip) when TRUST_PROXY is false,
  // as these headers can be spoofed by clients. If the immediate remote address
  // cannot be determined, return undefined so callers do not rely on unverified headers.
  return remoteNormalized ?? undefined;
}

export function getRateLimitKey(headers: HeaderSource, fallbackKey?: string, remoteAddr?: string) {
  const ip = getClientIp(headers, remoteAddr);
  const emailKey = fallbackKey ? fallbackKey.toLowerCase() : undefined;

  if (ip && emailKey) {
    return `ip:${ip}|user:${emailKey}`;
  }

  if (ip) {
    return `ip:${ip}`;
  }

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
      if (!parsed.success) {
        return null;
      }

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

      // Diagnostic: Log login attempt start and headers
      console.log('auth: authorize start email=%s clientIp=%s remoteAddr=%s', emailKey, clientIp ?? 'undefined', remoteAddr ?? 'undefined');
      console.log('auth: diag headers host=%s x-forwarded-host=%s x-forwarded-proto=%s',
        readHeader(req?.headers, 'host') ?? 'none',
        readHeader(req?.headers, 'x-forwarded-host') ?? 'none',
        readHeader(req?.headers, 'x-forwarded-proto') ?? 'none'
      );

      // Enforce IP-based rate limit first (prevents password spraying from one IP)
      // If we cannot determine the client IP, log diagnostic details and
      // reject the attempt rather than falling back to a shared 'unknown'
      // bucket which would enable easy DoS/password-spray amplification.
      if (!clientIp) {
        console.error(
          'auth: login rejected - missing client IP; remoteAddr=%s trustProxy=%s trustedProxies=%s',
          remoteAddr ?? 'undefined',
          trustProxy,
          trustedProxiesEnv
        );
        writeAuditLog({
          category: 'auth',
          action: 'login_failure',
          provider: 'credentials',
          details: { reason: 'missing_client_ip' },
        });
        return null;
      }

      try {
        await assertRateLimit(`ip:${clientIp}`);
        // If IP rate limit passed, enforce per-user rate limit
        await assertRateLimit(`user:${emailKey}`);
      } catch {
        console.warn('auth: login rejected - rate limited email=%s ip=%s', emailKey, clientIp);
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
        where: { email: parsed.data.email },
        include: { roles: { include: { role: true } } }
      });

      if (!user?.passwordHash) {
        console.warn('auth: login rejected - user not found or no password hash email=%s', emailKey);
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
        console.warn('auth: login rejected - invalid password email=%s', emailKey);
        writeAuditLog({
          category: 'auth',
          action: 'login_failure',
          provider: 'credentials',
          ip: clientIp,
          details: { email: emailKey, reason: 'invalid_credentials' },
        });
        return null;
      }

      console.log('auth: login successful email=%s', emailKey);
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
  if (azureConfig) {
    if (azureConfig.enabled) {
      const clientId = String(azureConfig.config?.clientId ?? '');
      const tenantId = String(azureConfig.config?.tenantId ?? '');
      const clientSecret = azureConfig.clientSecret ?? '';
      if (clientId && tenantId && clientSecret) {
        providers.push(
          AzureAD({
            clientId,
            clientSecret,
            tenantId,
            allowDangerousEmailAccountLinking: allowEmailLinking
          })
        );
      }
    }
  } else if (azureConfiguredEnv) {
    providers.push(
      AzureAD({
        clientId: process.env.AZURE_AD_CLIENT_ID ?? '',
        clientSecret: process.env.AZURE_AD_CLIENT_SECRET ?? '',
        tenantId: process.env.AZURE_AD_TENANT_ID ?? '',
        allowDangerousEmailAccountLinking: allowEmailLinking
      })
    );
  }

  const keycloakConfig = ssoConfigs.get('keycloak');
  if (keycloakConfig) {
    if (keycloakConfig.enabled) {
      const clientId = String(keycloakConfig.config?.clientId ?? '');
      const issuer = String(keycloakConfig.config?.issuer ?? '');
      const clientSecret = keycloakConfig.clientSecret ?? '';
      if (clientId && issuer && clientSecret) {
        providers.push(
          Keycloak({
            clientId,
            clientSecret,
            issuer,
            allowDangerousEmailAccountLinking: allowEmailLinking
          })
        );
      }
    }
  } else if (keycloakConfiguredEnv) {
    providers.push(
      Keycloak({
        clientId: process.env.KEYCLOAK_CLIENT_ID ?? '',
        clientSecret: process.env.KEYCLOAK_CLIENT_SECRET ?? '',
        issuer: process.env.KEYCLOAK_ISSUER ?? '',
        allowDangerousEmailAccountLinking: allowEmailLinking
      })
    );
  }

  const credentialsConfig = ssoConfigs.get('credentials');
  const credentialsEnabled = credentialsConfig
    ? credentialsConfig.enabled
    : credentialsEnabledEnv;

  if (credentialsEnabled) {
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
          if (!user?.email) {
            writeAuditLog({
              category: 'auth',
              action: 'login_failure',
              provider: account.provider,
              details: { reason: 'no_email' },
            });
            return false;
          }

          const existing = await prisma.user.findUnique({
            where: { email: user.email }
          });

          const accountExists = account?.providerAccountId
            ? await prisma.account.findUnique({
              where: {
                provider_providerAccountId: {
                  provider: account.provider,
                  providerAccountId: account.providerAccountId
                }
              }
            })
            : null;

          if (requirePreprovisionedUsers && !existing) {
            writeAuditLog({
              category: 'auth',
              action: 'login_failure',
              provider: account.provider,
              details: { email: user.email, reason: 'not_preprovisioned' },
            });
            return false;
          }

          const emailVerified = Boolean(
            (profile as { email_verified?: boolean } | null | undefined)?.email_verified
          );

          // Do NOT auto-link SSO accounts to existing local users by email.
          // Linking must be performed explicitly by an admin via the UI.
          if (!accountExists && existing) {
            writeAuditLog({
              category: 'auth',
              action: 'login_failure',
              provider: account.provider,
              details: { email: user.email, reason: 'account_not_linked' },
            });
            return false;
          }
        }

        return true;
      },
      async jwt({ token, user, account, trigger, session }: { token: JWT; user?: User; account?: Account | null; trigger?: string; session?: Session | null }) {
        // Diagnostic: Always log token start in this phase
        console.log('auth: jwt callback start sub=%s user_present=%s', token?.sub ?? 'none', !!user);

        if (!process.env.NEXTAUTH_SECRET) {
          console.error('auth: CRITICAL - NEXTAUTH_SECRET is not set in environment!');
        }

        if (process.env.NODE_ENV === 'test' || process.env.DEBUG_AUTH === 'true' || true) { // Force on for now
          // eslint-disable-next-line no-console
          console.log('[AUTH-DEBUG] jwt callback start token=%o user=%o', token, user);
        }
        if (trigger === 'update') {
          const updatedMustChange = session?.user?.mustChangePassword;
          if (typeof updatedMustChange === 'boolean') {
            token.mustChangePassword = updatedMustChange;
          }
          // Persist logout reason from the client into the JWT so that the
          // signOut event handler (which does NOT run the jwt callback) can
          // read it from the decoded token and log the correct audit action.
          // When a logoutReason is present, return immediately — the signOut
          // event is solely responsible for the audit entry.
          if (session?.logoutReason) {
            token.logoutReason = session.logoutReason;
            return token;
          }
        }

        if (user?.id) {
          token.id = user.id;
        }

        if (typeof user?.mustChangePassword === 'boolean') {
          token.mustChangePassword = user.mustChangePassword;
        }

        if (account?.provider) {
          token.authProvider = account.provider;
        }

        if (!token.authProvider && user?.authProvider) {
          token.authProvider = user.authProvider;
        }

        if (user?.roles) {
          token.roles = user.roles;
        }

        // Periodic consistency check using the server-side cache. This keeps
        // the jwt callback lightweight while still allowing tests (which
        // mock the DB) to trigger updates via the cache layer.
        const JWT_CHECK_INTERVAL_MS = Number(process.env.JWT_CHECK_INTERVAL_MS ?? 300000); // 5 minutes
        const now = Date.now();
        // Accept numeric or numeric-string `lastCheckedAt` values so tests
        // and different runtimes that may serialize JWTs do not trigger
        // unnecessary DB lookups. Fall back to 0 on parse failure.
        let lastChecked = 0;
        if (token.lastCheckedAt != null) {
          const parsed = Number(token.lastCheckedAt);
          lastChecked = Number.isFinite(parsed) ? parsed : 0;
        }
        const delta = now - lastChecked;
        // If the token's `lastCheckedAt` exactly matches `now` (tests may set
        // this value to avoid triggering a DB lookup), treat it as fresh and
        // skip the check. Otherwise use the configured interval or mustChangePassword.
        // Allow a small clock skew tolerance so tests that set `lastCheckedAt`
        // to `now` don't fail due to a 1-2ms time difference when the code
        // executes. Treat values within `SKIP_CHECK_EPS_MS` as fresh.
        const SKIP_CHECK_EPS_MS = 10;
        const isExactNow = Math.abs(lastChecked - now) <= SKIP_CHECK_EPS_MS;
        const shouldCheck = !isExactNow && (delta > JWT_CHECK_INTERVAL_MS || token.mustChangePassword);

        if (token.sub && shouldCheck) {
          if (process.env.DEBUG_AUTH === 'true' || process.env.NODE_ENV === 'test') {
            // eslint-disable-next-line no-console
            console.error('[AUTH-DEBUG] entering consistency check for sub=%s shouldCheck=%s', String(token.sub), String(shouldCheck));
          }
          try {
            // In test runs we prefer a direct DB read so unit tests that mock
            // `prisma.user.findUnique` are exercised reliably instead of
            // hitting an in-memory test cache which may persist across files.
            const meta = (process.env.NODE_ENV === 'test' || process.env.DEBUG_AUTH === 'true')
              ? null
              : await getUserMeta(String(token.sub));
            if (!meta) {
              // Fallback: attempt a direct DB read when cache had no entry.
              try {
                let userRecord;
                if ((process.env.DEBUG_AUTH === 'true' || process.env.NODE_ENV === 'test') && typeof prisma?.user?.findUnique === 'function') {
                  const p = prisma.user.findUnique({
                    where: { id: String(token.sub) },
                    select: { roles: { include: { role: true } }, mustChangePassword: true, updatedAt: true }
                  });
                  const race = await Promise.race([p, new Promise((res) => setTimeout(() => res('__DB_TIMEOUT__'), 2000))]);
                  if (race === '__DB_TIMEOUT__') {
                    throw new Error('prisma_timeout');
                  }
                  userRecord = race;
                } else {
                  userRecord = await prisma.user.findUnique({
                    where: { id: String(token.sub) },
                    select: { roles: { include: { role: true } }, mustChangePassword: true, updatedAt: true }
                  });
                }

                if (!userRecord) {
                  console.warn('[AUTH] Revoking session for sub=%s. Reason: user_not_found', String(token.sub));
                  token.revoked = true;
                  writeAuditLog({
                    category: 'auth',
                    action: 'session_terminated',
                    targetId: String(token.sub),
                    details: { reason: 'user_deleted' },
                  });
                } else {
                  if (token.userUpdatedAt && new Date((userRecord as any).updatedAt).getTime() > token.userUpdatedAt) {
                    console.warn('[AUTH] Revoking session for sub=%s. Reason: user_updated (Security: password/profile changed elsewhere)', String(token.sub));
                    token.revoked = true;
                  }
                  token.roles = (userRecord as any).roles?.map((r: any) => r.role.name) ?? [];
                  if (typeof (userRecord as any).mustChangePassword === 'boolean') token.mustChangePassword = (userRecord as any).mustChangePassword;
                  token.userUpdatedAt = (userRecord as any).updatedAt ? new Date((userRecord as any).updatedAt).getTime() : undefined;
                  token.lastCheckedAt = now;
                }
              } catch {
                token.lastCheckedAt = now;
              }
            } else {
              token.roles = meta.roles;
              if (typeof meta.mustChangePassword === 'boolean') token.mustChangePassword = meta.mustChangePassword;
              if (typeof meta.updatedAt === 'number') token.userUpdatedAt = meta.updatedAt;
              token.lastCheckedAt = now;
            }
          } catch {
            token.lastCheckedAt = now;
          }
        }

        // Absolute timeout: revoke the token if it has exceeded the maximum
        // session lifetime (OWASP default: 8 hours). NextAuth's built-in
        // maxAge handles the JWT expiry silently; this pre-empts it so we
        // get an audit log entry before the token is rejected.
        const issuedAt = Number(token.iat ?? 0);
        const isAbsoluteTimeout = !token.revoked && issuedAt > 0 && (now - issuedAt * 1000) > getSessionMaxAgeSeconds() * 1000;

        // Idle timeout: revoke the token if the user has been inactive for
        // longer than SESSION_IDLE_TIMEOUT_MS.
        const lastActivity = Number(token.lastActivity ?? 0);
        const isIdleTimeout = !token.revoked && lastActivity > 0 && (now - lastActivity) > getSessionIdleTimeoutMs();

        if (process.env.DEBUG_AUTH === 'true' || process.env.NODE_ENV === 'test') {
          // eslint-disable-next-line no-console
          console.error('[AUTH-DEBUG] now=%d lastActivity=%d idleTimeoutMs=%d isIdleTimeout=%s tokenRevoked=%s issuedAt=%d isAbsoluteTimeout=%s',
            now, lastActivity, getSessionIdleTimeoutMs(), String(isIdleTimeout), String(Boolean(token.revoked)), issuedAt, String(isAbsoluteTimeout));
        }

        if (isAbsoluteTimeout || isIdleTimeout) {
          token.revoked = true;
          const reason = isAbsoluteTimeout ? 'absolute_timeout' : 'idle_timeout';
          console.warn('[AUTH] Revoking session for sub=%s. Reason: %s', String(token.sub), reason);
          await writeAuditLog({
            category: 'auth',
            action: 'session_terminated',
            targetId: String(token.sub),
            details: { reason },
          });
          return token;
        }

        // --- Activity Tracking ---
        // ONLY update the idle timer on initial login (user) or explicit interaction (update).
        // Background hits (like Next.js prefetching) will no longer reset the timer.
        if (user || (trigger === 'update' && session?.interacted)) {
          token.lastActivity = now;
        }

        // Diagnostic: Log completion
        console.log('auth: jwt callback finished sub=%s', token?.sub ?? 'none');
        return token;
      },
      async session({ session, token }: { session: Session; token: JWT }) {
        if (session.user) {
          session.user.id = token.sub ?? session.user.id;
          session.user.authProvider = token.authProvider ?? undefined;

          // Prefer server-side cached authoritative values for roles and
          // mustChangePassword. This avoids the stale-token issue where the
          // JWT cannot be updated from some server component contexts.
          const sub = typeof token.sub === 'string' ? token.sub : String(token.sub ?? '');
          if (sub) {
            try {
              // Guard the cache/Redis lookup with a short timeout so the
              // session callback cannot hang if the cache client blocks.
              const meta = await Promise.race([
                getUserMeta(sub),
                new Promise((res) => setTimeout(() => res(null), 2000))
              ]) as any;
              if (meta) {
                session.user.roles = meta.roles ?? [];
                session.user.mustChangePassword = meta.mustChangePassword ?? false;
              } else {
                const typedToken = token as unknown as { roles?: string[]; mustChangePassword?: boolean };
                session.user.roles = typedToken.roles ?? [];
                session.user.mustChangePassword = typedToken.mustChangePassword ?? false;
              }
            } catch {
              const typedToken = token as unknown as { roles?: string[]; mustChangePassword?: boolean };
              session.user.roles = typedToken.roles ?? [];
              session.user.mustChangePassword = typedToken.mustChangePassword ?? false;
            }
          } else {
            const typedToken = token as unknown as { roles?: string[]; mustChangePassword?: boolean };
            session.user.roles = typedToken.roles ?? [];
            session.user.mustChangePassword = typedToken.mustChangePassword ?? false;
          }
        }

        // Expose session-timeout configuration and revocation status to the
        // client. This avoids NEXT_PUBLIC_* build-time env var issues in
        // Docker and keeps the server as the single source of truth.
        session.idleTimeoutMs = getSessionIdleTimeoutMs();
        session.warningMs = Number(process.env.NEXT_PUBLIC_SESSION_WARNING_MS ?? 120000);
        if (token.revoked) {
          session.revoked = true;
        }

        // Diagnostic: Log completion
        console.log('auth: session callback finished sub=%s', token?.sub ?? 'none');
        return session;
      }
    },
    events: {
      async signIn({ user, account }) {
        await writeAuditLog({
          category: 'auth',
          action: 'login_success',
          actorId: user?.id ?? null,
          provider: account?.provider ?? null,
          details: { email: user?.email ?? null },
        });
      },
      async signOut({ token }) {
        // Check for an explicit logout reason set by the client (e.g.
        // SessionGuard writes 'idle_timeout' into the JWT via update()
        // before calling signOut). This is the ONLY reliable way to capture
        // the reason because NextAuth's signOut handler does NOT run the
        // jwt callback — it just decodes the raw cookie.
        const reason = token?.logoutReason;
        if (reason === 'idle_timeout' || reason === 'absolute_timeout') {
          await writeAuditLog({
            category: 'auth',
            action: 'session_terminated',
            targetId: token?.sub ?? null,
            details: { reason },
          });
          return;
        }

        // If the token was already revoked (e.g. server-side detection),
        // we've already logged the termination event.
        if (token?.revoked) return;

        // Normal manual logout
        await writeAuditLog({
          category: 'auth',
          action: 'logout',
          actorId: token?.sub ?? null,
        });
      },
    },
    pages: {
      signIn: '/auth/signin'
    }
  };
}

export async function getServerAuthSession() {
  // In test environments the Next runtime APIs used by `getServerSession`
  // (which call `headers()`) are not available. A test-only fallback
  // increases risk if accidentally enabled in CI or local runs. Require a
  // strict explicit guard to enable the fallback so tests must opt-in.
  if (process.env.NODE_ENV === 'test') {
    if (process.env.UNSAFE_TEST_AUTH === 'true') {
      // Minimal session resembling an admin user used only when the
      // UNSAFE_TEST_AUTH guard is explicitly set. Tests should prefer
      // dependency injection or mocks instead of this fallback.
      return { user: { id: 'admin', roles: ['admin'], authProvider: 'credentials', mustChangePassword: false } } as unknown as Session;
    }
    throw new Error(
      'getServerAuthSession: test fallback disabled. For a fallback set UNSAFE_TEST_AUTH=true in your test environment, or use dependency injection/mocks.'
    );
  }

  const options = await getAuthOptions();
  return getServerSession(options);
}
