import type { NextAuthOptions } from 'next-auth';
import AzureAD from 'next-auth/providers/azure-ad';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { z } from 'zod';
import { prisma } from './prisma';
import { verifyPassword } from './password';
import { assertRateLimit } from './rateLimit';
import { getServerSession } from 'next-auth';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const azureConfigured =
  Boolean(process.env.AZURE_AD_CLIENT_ID) &&
  Boolean(process.env.AZURE_AD_CLIENT_SECRET) &&
  Boolean(process.env.AZURE_AD_TENANT_ID);

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: 'jwt' },
  providers: [
    ...(azureConfigured
      ? [
          AzureAD({
            clientId: process.env.AZURE_AD_CLIENT_ID ?? '',
            clientSecret: process.env.AZURE_AD_CLIENT_SECRET ?? '',
            tenantId: process.env.AZURE_AD_TENANT_ID ?? ''
          })
        ]
      : []),
    Credentials({
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

        const forwardedFor = req?.headers?.['x-forwarded-for'];
        const ip = forwardedFor?.split(',')[0]?.trim() ?? 'local';
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
          roles: user.roles.map((item) => item.role.name)
        };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
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
      }
      return session;
    }
  },
  pages: {
    signIn: '/auth/signin'
  }
};

export function getServerAuthSession() {
  return getServerSession(authOptions);
}
