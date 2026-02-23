import type { NextAuthOptions } from 'next-auth';
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
const allowEmailLinking = process.env.ALLOW_SSO_EMAIL_LINKING === 'true';
const trustProxy = process.env.TRUST_PROXY === 'true';
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

function getRateLimitKey(headers: HeaderSource, fallbackKey?: string) {
  if (trustProxy) {
    const forwardedFor = readHeader(headers, 'x-forwarded-for');
    const realIp = readHeader(headers, 'x-real-ip');
    const clientIp = readHeader(headers, 'x-client-ip');
    const cfIp = readHeader(headers, 'cf-connecting-ip');
    const trueClientIp = readHeader(headers, 'true-client-ip');
    const forwarded = parseForwarded(readHeader(headers, 'forwarded'));
    const raw = forwardedFor ?? realIp ?? clientIp ?? cfIp ?? trueClientIp ?? forwarded;
    if (raw) {
      return raw.split(',')[0]?.trim() ?? 'unknown';
    }
  }

  return fallbackKey ? `user:${fallbackKey.toLowerCase()}` : 'unknown';
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

      const ip = getRateLimitKey(req?.headers, parsed.data.email);
      await assertRateLimit(ip);

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

          if (allowEmailLinking && existing && !accountExists && !emailVerified) {
            return false;
          }

          if (allowEmailLinking && existing && !accountExists && emailVerified) {
            await prisma.user.update({
              where: { id: existing.id },
              data: { mustChangePassword: false }
            });
          }
        }

        return true;
      },
      async jwt({ token, user, account }) {
        if (user?.id) {
          token.id = user.id;
        }

        if (typeof user?.mustChangePassword === 'boolean') {
          token.mustChangePassword = user.mustChangePassword;
        }

        if (account?.provider) {
          token.authProvider = account.provider;
        }

        if (!token.authProvider && (user as { authProvider?: string } | undefined)?.authProvider) {
          token.authProvider = (user as { authProvider?: string }).authProvider;
        }

        return token;
      },
      async session({ session, token }) {
        if (session.user) {
          const userId = token.sub ?? '';
          session.user.id = userId;
          session.user.authProvider = token.authProvider as string | undefined;

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
            session.user.roles = (token.roles as string[] | undefined) ?? [];
            session.user.mustChangePassword =
              (token.mustChangePassword as boolean | undefined) ?? false;
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
