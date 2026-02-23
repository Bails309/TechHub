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

function getRateLimitKey(headers: Record<string, string | string[] | undefined>) {
  if (trustProxy) {
    const forwardedFor = headers['x-forwarded-for'];
    const raw = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    if (raw) {
      return raw.split(',')[0]?.trim() ?? 'unknown';
    }
    const realIp = headers['x-real-ip'];
    return Array.isArray(realIp) ? realIp[0] ?? 'unknown' : realIp ?? 'unknown';
  }

  return 'local';
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

      const ip = getRateLimitKey(req?.headers ?? {});
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
      async signIn({ user, account }) {
        if (account?.provider && account.provider !== 'credentials') {
          if (!user?.email) {
            return false;
          }

          const existing = await prisma.user.findUnique({
            where: { email: user.email }
          });

          if (requirePreprovisionedUsers && !existing) {
            return false;
          }

          if (allowEmailLinking && existing) {
            await prisma.$transaction([
              prisma.user.update({
                where: { id: existing.id },
                data: {
                  passwordHash: null,
                  mustChangePassword: false
                }
              }),
              prisma.passwordHistory.deleteMany({
                where: { userId: existing.id }
              })
            ]);
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

        if (!token.roles && token.sub) {
          const roles = await prisma.userRole.findMany({
            where: { userId: token.sub },
            include: { role: true }
          });
          token.roles = roles.map((item) => item.role.name);
        }

        return token;
      },
      async session({ session, token }) {
        if (session.user) {
          session.user.roles = (token.roles as string[] | undefined) ?? [];
          session.user.id = token.sub ?? '';
          session.user.mustChangePassword =
            (token.mustChangePassword as boolean | undefined) ?? false;
          session.user.authProvider = token.authProvider as string | undefined;
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
