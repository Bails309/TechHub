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
import { getSsoConfigMap } from './sso';
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

  // If TRUST_PROXY is enabled and the immediate remote is a trusted proxy,
  // accept proxy-supplied headers (but only from configured trusted proxies).
  if (trustProxy) {
    if (remoteNormalized && isFromTrustedProxy(remoteNormalized)) {
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

      // fallbacks for other single-value headers
      const realIp = normalizeIp(readHeader(headers, 'x-real-ip'));
      if (realIp && !isFromTrustedProxy(realIp)) return realIp;
      const cfIp = normalizeIp(readHeader(headers, 'cf-connecting-ip'));
      if (cfIp && !isFromTrustedProxy(cfIp)) return cfIp;
      const trueClientIp = normalizeIp(readHeader(headers, 'true-client-ip'));
      if (trueClientIp && !isFromTrustedProxy(trueClientIp)) return trueClientIp;
      const forwarded = parseForwarded(readHeader(headers, 'forwarded'));
      const forwardedIp = normalizeIp(forwarded);
      if (forwardedIp && !isFromTrustedProxy(forwardedIp)) return forwardedIp;

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

      // Enforce IP-based rate limit first (prevents password spraying from one IP)
      if (clientIp) {
        await assertRateLimit(`ip:${clientIp}`);
        // If IP rate limit passed, enforce per-user rate limit
        await assertRateLimit(`user:${emailKey}`);
      } else {
        // No client IP available: fall back to per-user rate limiting
        await assertRateLimit(`user:${emailKey}`);
      }

      const user = await prisma.user.findUnique({
        where: { email: parsed.data.email },
        include: { roles: { include: { role: true } } }
      });

      if (!user?.passwordHash) {
        return null;
      }

      const valid = await verifyPassword(parsed.data.password, user.passwordHash);
      if (!valid) {
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
  const baseAdapter = PrismaAdapter(prisma);
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
    session: { strategy: 'jwt' },
    providers,
    callbacks: {
      async signIn({ user, account, profile }) {
        if (account?.provider && account.provider !== 'credentials') {
          if (!user?.email) {
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
            return false;
          }

          const emailVerified = Boolean(
            (profile as { email_verified?: boolean } | null | undefined)?.email_verified
          );

          if (!accountExists && existing && !allowEmailLinking) {
            return false;
          }

          if (allowEmailLinking && existing && !accountExists) {
            if (!emailVerified) {
              return false;
            }
            await prisma.user.update({
              where: { id: existing.id },
              data: { mustChangePassword: false }
            });
          }
        }

        return true;
      },
      async jwt({ token, user, account, trigger, session }: { token: JWT; user?: User; account?: Account | null; trigger?: string; session?: Session | null }) {
        if (trigger === 'update') {
          const updatedMustChange = session?.user?.mustChangePassword;
          if (typeof updatedMustChange === 'boolean') {
            token.mustChangePassword = updatedMustChange;
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

        return token;
      },
      async session({ session, token }: { session: Session; token: JWT }) {
        if (session.user) {
          const userId = token.sub ?? '';
          session.user.id = userId;
          session.user.authProvider = token.authProvider ?? undefined;

          if (userId) {
            const userRecord = await prisma.user.findUnique({
              where: { id: userId },
              select: {
                mustChangePassword: true,
                roles: { include: { role: true } }
              }
            });
            session.user.roles = userRecord?.roles.map((item) => item.role.name) ?? [];
            session.user.mustChangePassword = userRecord?.mustChangePassword ?? false;
          } else {
            session.user.roles = token.roles ?? [];
            session.user.mustChangePassword = token.mustChangePassword ?? false;
          }
        }
        return session;
      }
    },
    pages: {
      signIn: '/auth/signin'
    }
  };
}

export async function getServerAuthSession() {
  const options = await getAuthOptions();
  return getServerSession(options);
}
