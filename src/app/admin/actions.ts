'use server';

import { z } from 'zod';
import path from 'path';
import { randomUUID } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import { revalidatePath, revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { getServerAuthSession } from '@/lib/auth';
import { encryptSecret, hasSecretKey } from '@/lib/crypto';
import { hashPassword, validatePasswordComplexity } from '@/lib/password';
import { getPasswordPolicy } from '@/lib/passwordPolicy';
import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { Agent, fetch as undiciFetch } from 'undici';

const appSchemaBase = z.object({
  name: z.string().min(2),
  url: z.string().url(),
  categorySelect: z.string().optional(),
  categoryNew: z.string().optional(),
  description: z.string().optional(),
  audience: z.enum(['PUBLIC', 'AUTHENTICATED', 'ROLE', 'USER']),
  roleId: z.string().optional(),
  userIds: z.array(z.string()).optional()
});

const appSchema = appSchemaBase
  .refine((data) => (data.audience === 'ROLE' ? Boolean(data.roleId) : true), {
    message: 'Role is required for role-based apps',
    path: ['roleId']
  })
  .refine((data) => (data.audience === 'USER' ? Boolean(data.userIds?.length) : true), {
    message: 'At least one user is required for user-specific apps',
    path: ['userIds']
  });

const updateSchema = appSchemaBase
  .extend({
    id: z.string().min(1)
  })
  .refine((data) => (data.audience === 'ROLE' ? Boolean(data.roleId) : true), {
    message: 'Role is required for role-based apps',
    path: ['roleId']
  })
  .refine((data) => (data.audience === 'USER' ? Boolean(data.userIds?.length) : true), {
    message: 'At least one user is required for user-specific apps',
    path: ['userIds']
  });

const MAX_ICON_BYTES = 2 * 1024 * 1024;
const ALLOWED_ICON_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg'
]);
const ALLOWED_ICON_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg'
]);

const uploadSchema = z
  .instanceof(File)
  .refine((file) => file.size > 0, { message: 'Empty file' })
  .refine((file) => file.size <= MAX_ICON_BYTES, { message: 'File too large' })
  .refine((file) => {
    const extension = path.extname(file.name).toLowerCase();
    if (ALLOWED_ICON_EXTENSIONS.has(extension)) {
      return true;
    }
    return ALLOWED_ICON_MIME_TYPES.has(file.type);
  }, { message: 'Invalid file type' });

async function saveIcon(file: File) {
  const parsed = uploadSchema.safeParse(file);
  if (!parsed.success) {
    return undefined;
  }

  const extension = path.extname(file.name) || '.png';
  const filename = `${randomUUID()}${extension}`;
  const uploadDir = path.join(process.cwd(), 'uploads');
  await mkdir(uploadDir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(uploadDir, filename), buffer);
  return `/uploads/${filename}`;
}

export async function createApp(formData: FormData) {
  const session = await getServerAuthSession();
  if (!session?.user?.roles?.includes('admin')) {
    throw new Error('Unauthorized');
  }

  const payload = appSchema.parse({
    name: formData.get('name'),
    url: formData.get('url'),
    categorySelect: formData.get('categorySelect') || undefined,
    categoryNew: formData.get('categoryNew') || undefined,
    description: formData.get('description') || undefined,
    audience: formData.get('audience'),
    roleId: formData.get('roleId') || undefined,
    userIds: formData.getAll('userIds').map((value) => String(value))
  });

  const iconFile = formData.get('icon');
  const iconPath = iconFile instanceof File ? await saveIcon(iconFile) : undefined;

  const normalizedNewCategory = payload.categoryNew?.trim();
  const normalizedSelect = payload.categorySelect?.trim();
  const category =
    normalizedNewCategory && normalizedNewCategory.length > 0
      ? normalizedNewCategory
      : normalizedSelect && normalizedSelect !== 'none'
        ? normalizedSelect
        : undefined;

  await prisma.$transaction(async (tx) => {
    const app = await tx.appLink.create({
      data: {
        name: payload.name,
        url: payload.url,
        category,
        description: payload.description,
        audience: payload.audience,
        roleId: payload.audience === 'ROLE' ? payload.roleId : null,
        icon: iconPath
      }
    });

    if (payload.audience === 'USER' && payload.userIds?.length) {
      await tx.userAppAccess.createMany({
        data: payload.userIds.map((userId) => ({ userId, appId: app.id })),
        skipDuplicates: true
      });
    }
  });

  revalidatePath('/admin');
  revalidatePath('/');
}

export async function deleteApp(formData: FormData) {
  const session = await getServerAuthSession();
  if (!session?.user?.roles?.includes('admin')) {
    throw new Error('Unauthorized');
  }

  const id = String(formData.get('id') ?? '');
  if (!id) {
    return;
  }

  await prisma.appLink.delete({
    where: { id }
  });

  revalidatePath('/admin');
  revalidatePath('/');
}

export async function updateApp(formData: FormData) {
  const session = await getServerAuthSession();
  if (!session?.user?.roles?.includes('admin')) {
    throw new Error('Unauthorized');
  }

  const payload = updateSchema.parse({
    id: formData.get('id'),
    name: formData.get('name'),
    url: formData.get('url'),
    categorySelect: formData.get('categorySelect') || undefined,
    categoryNew: formData.get('categoryNew') || undefined,
    description: formData.get('description') || undefined,
    audience: formData.get('audience'),
    roleId: formData.get('roleId') || undefined,
    userIds: formData.getAll('userIds').map((value) => String(value))
  });

  const iconFile = formData.get('icon');
  const iconPath = iconFile instanceof File ? await saveIcon(iconFile) : undefined;
  const iconRemove = formData.get('iconRemove') === 'on';

  const normalizedNewCategory = payload.categoryNew?.trim();
  const normalizedSelect = payload.categorySelect?.trim();
  const category =
    normalizedNewCategory && normalizedNewCategory.length > 0
      ? normalizedNewCategory
      : normalizedSelect && normalizedSelect !== 'none'
        ? normalizedSelect
        : null;

  await prisma.$transaction(async (tx) => {
    await tx.appLink.update({
      where: { id: payload.id },
      data: {
        name: payload.name,
        url: payload.url,
        category,
        description: payload.description,
        audience: payload.audience,
        roleId: payload.audience === 'ROLE' ? payload.roleId : null,
        ...(iconRemove ? { icon: null } : {}),
        ...(iconPath ? { icon: iconPath } : {})
      }
    });

    await tx.userAppAccess.deleteMany({ where: { appId: payload.id } });
    if (payload.audience === 'USER' && payload.userIds?.length) {
      await tx.userAppAccess.createMany({
        data: payload.userIds.map((userId) => ({ userId, appId: payload.id })),
        skipDuplicates: true
      });
    }
  });

  revalidatePath('/admin');
  revalidatePath('/');
}

const userRoleSchema = z.object({
  userId: z.string().min(1),
  roleIds: z.array(z.string().min(1))
});

export async function updateUserRoles(formData: FormData) {
  const session = await getServerAuthSession();
  if (!session?.user?.roles?.includes('admin')) {
    throw new Error('Unauthorized');
  }

  const userId = String(formData.get('userId') ?? '').trim();
  const roleIds = formData
    .getAll('roles')
    .map((value) => String(value))
    .filter(Boolean);
  const confirmAdminGrant = formData.get('confirmAdminGrant') === 'on';

  const parsed = userRoleSchema.safeParse({ userId, roleIds });
  if (!parsed.success) {
    return;
  }

  const validRoles = await prisma.role.findMany({ select: { id: true } });
  const validSet = new Set(validRoles.map((role) => role.id));
  const nextRoles = parsed.data.roleIds.filter((id) => validSet.has(id));

  const adminRole = await prisma.role.findUnique({ where: { name: 'admin' } });
  const adminRoleId = adminRole?.id;
  const currentRoles = await prisma.userRole.findMany({
    where: { userId: parsed.data.userId }
  });
  const currentlyAdmin = adminRoleId
    ? currentRoles.some((role) => role.roleId === adminRoleId)
    : false;
  const nextAdmin = adminRoleId ? nextRoles.includes(adminRoleId) : false;

  if (adminRoleId && parsed.data.userId === session.user.id && !nextAdmin) {
    redirect('/admin?error=self-admin');
  }

  if (adminRoleId && nextAdmin && !currentlyAdmin && !confirmAdminGrant) {
    redirect('/admin?error=confirm-admin');
  }

  await prisma.$transaction([
    prisma.userRole.deleteMany({ where: { userId: parsed.data.userId } }),
    prisma.userRole.createMany({
      data: nextRoles.map((roleId) => ({ userId: parsed.data.userId, roleId })),
      skipDuplicates: true
    })
  ]);

  revalidatePath('/admin');
}

const roleSchema = z.object({
  name: z.string().min(2).max(48)
});

export async function createRole(formData: FormData) {
  const session = await getServerAuthSession();
  if (!session?.user?.roles?.includes('admin')) {
    throw new Error('Unauthorized');
  }

  const payload = roleSchema.safeParse({
    name: String(formData.get('name') ?? '').trim().toLowerCase()
  });

  if (!payload.success) {
    return;
  }

  await prisma.role.upsert({
    where: { name: payload.data.name },
    update: {},
    create: { name: payload.data.name }
  });

  revalidatePath('/admin');
}

export async function deleteRole(formData: FormData) {
  const session = await getServerAuthSession();
  if (!session?.user?.roles?.includes('admin')) {
    throw new Error('Unauthorized');
  }

  const roleId = String(formData.get('roleId') ?? '').trim();
  if (!roleId) {
    return;
  }

  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role || role.name === 'admin') {
    throw new Error('Cannot delete admin role');
  }

  const [userRoleCount, appRoleCount] = await Promise.all([
    prisma.userRole.count({ where: { roleId } }),
    prisma.appLink.count({ where: { roleId } })
  ]);

  if (userRoleCount > 0 || appRoleCount > 0) {
    throw new Error('Role is assigned; remove assignments before deleting');
  }

  await prisma.role.delete({ where: { id: roleId } });
  revalidatePath('/admin');
}

const localUserSchema = z.object({
  name: z.string().optional(),
  email: z.string().email(),
  password: z.string().min(1),
  roleIds: z.array(z.string().min(1)).optional()
});

export type CreateLocalUserState = {
  status: 'idle' | 'success' | 'error';
  message: string;
};

export type LinkSsoAccountState = {
  status: 'idle' | 'success' | 'error';
  message: string;
};

export async function createLocalUser(
  _prevState: CreateLocalUserState,
  formData: FormData
): Promise<CreateLocalUserState> {
  const session = await getServerAuthSession();
  if (!session?.user?.roles?.includes('admin')) {
    return { status: 'error', message: 'Unauthorized' };
  }

  const payload = localUserSchema.safeParse({
    name: String(formData.get('name') ?? '').trim() || undefined,
    email: String(formData.get('email') ?? '').trim().toLowerCase(),
    password: String(formData.get('password') ?? ''),
    roleIds: formData.getAll('roles').map((value) => String(value)).filter(Boolean)
  });

  if (!payload.success) {
    return { status: 'error', message: 'Invalid user details' };
  }

  const policy = await getPasswordPolicy();
  const complexityError = validatePasswordComplexity(payload.data.password, policy);
  if (complexityError) {
    return { status: 'error', message: complexityError };
  }

  const validRoles = await prisma.role.findMany({ select: { id: true } });
  const validSet = new Set(validRoles.map((role) => role.id));
  const roleIds = (payload.data.roleIds ?? []).filter((id) => validSet.has(id));

  const passwordHash = await hashPassword(payload.data.password);
  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: payload.data.name,
          email: payload.data.email,
          passwordHash,
          mustChangePassword: true
        }
      });

      if (roleIds.length) {
        await tx.userRole.createMany({
          data: roleIds.map((roleId) => ({ userId: user.id, roleId })),
          skipDuplicates: true
        });
      }

      await tx.passwordHistory.create({
        data: { userId: user.id, hash: passwordHash }
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { status: 'error', message: 'User already exists' };
    }
    throw error;
  }

  revalidatePath('/admin');
  return { status: 'success', message: 'Local user created' };
}

const linkSsoAccountSchema = z.object({
  email: z.string().email(),
  provider: z.enum(['azure-ad', 'keycloak']),
  providerAccountId: z.string().min(1)
});

export async function linkSsoAccount(
  _prevState: LinkSsoAccountState,
  formData: FormData
): Promise<LinkSsoAccountState> {
  const session = await getServerAuthSession();
  if (!session?.user?.roles?.includes('admin')) {
    return { status: 'error', message: 'Unauthorized' };
  }

  const payload = linkSsoAccountSchema.safeParse({
    email: String(formData.get('email') ?? '').trim().toLowerCase(),
    provider: String(formData.get('provider') ?? '').trim(),
    providerAccountId: String(formData.get('providerAccountId') ?? '').trim()
  });

  if (!payload.success) {
    return { status: 'error', message: 'Invalid link details' };
  }

  const user = await prisma.user.findUnique({ where: { email: payload.data.email } });
  if (!user) {
    return { status: 'error', message: 'User not found' };
  }

  const existingAccount = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: payload.data.provider,
        providerAccountId: payload.data.providerAccountId
      }
    }
  });

  if (existingAccount && existingAccount.userId !== user.id) {
    return { status: 'error', message: 'SSO account already linked to another user' };
  }

  const userProviderAccount = await prisma.account.findFirst({
    where: { userId: user.id, provider: payload.data.provider }
  });

  if (userProviderAccount && userProviderAccount.providerAccountId !== payload.data.providerAccountId) {
    return { status: 'error', message: 'User already linked to a different SSO account' };
  }

  try {
    await prisma.$transaction([
      prisma.account.upsert({
        where: {
          provider_providerAccountId: {
            provider: payload.data.provider,
            providerAccountId: payload.data.providerAccountId
          }
        },
        update: { userId: user.id },
        create: {
          userId: user.id,
          type: 'oauth',
          provider: payload.data.provider,
          providerAccountId: payload.data.providerAccountId
        }
      }),
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: null, mustChangePassword: false }
      }),
      prisma.passwordHistory.deleteMany({
        where: { userId: user.id }
      })
    ]);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { status: 'error', message: 'SSO account already linked' };
    }
    throw error;
  }

  revalidatePath('/admin');
  return { status: 'success', message: 'SSO account linked' };
}

const passwordPolicySchema = z.object({
  minLength: z.number().int().min(8).max(64),
  requireUpper: z.boolean(),
  requireLower: z.boolean(),
  requireNumber: z.boolean(),
  requireSymbol: z.boolean(),
  historyCount: z.number().int().min(0).max(20)
});

export async function updatePasswordPolicy(formData: FormData) {
  const session = await getServerAuthSession();
  if (!session?.user?.roles?.includes('admin')) {
    throw new Error('Unauthorized');
  }

  const payload = passwordPolicySchema.safeParse({
    minLength: Number(formData.get('minLength') ?? 0),
    requireUpper: formData.get('requireUpper') === 'on',
    requireLower: formData.get('requireLower') === 'on',
    requireNumber: formData.get('requireNumber') === 'on',
    requireSymbol: formData.get('requireSymbol') === 'on',
    historyCount: Number(formData.get('historyCount') ?? 0)
  });

  if (!payload.success) {
    return;
  }

  await prisma.passwordPolicy.upsert({
    where: { id: 'singleton' },
    update: payload.data,
    create: { id: 'singleton', ...payload.data }
  });

  revalidatePath('/admin');
}

type SsoActionState = {
  status: 'idle' | 'success' | 'error';
  message: string;
};

const ssoProviderSchema = z.enum(['azure-ad', 'keycloak', 'credentials']);
const ssoIntentSchema = z.enum(['save', 'test']);

const ssoAzureSchema = z.object({
  provider: z.literal('azure-ad'),
  enabled: z.boolean(),
  clientId: z.string().optional(),
  tenantId: z.string().optional(),
  clientSecret: z.string().optional(),
  clearSecret: z.boolean()
});

const ssoKeycloakSchema = z.object({
  provider: z.literal('keycloak'),
  enabled: z.boolean(),
  clientId: z.string().optional(),
  issuer: z.string().optional(),
  clientSecret: z.string().optional(),
  clearSecret: z.boolean()
});

function normalizeIssuer(value: string) {
  return value.replace(/\/+$/, '');
}

function isPrivateIpv4(ip: string) {
  const parts = ip.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isPrivateIpv6(ip: string) {
  const normalized = ip.toLowerCase();
  if (normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (normalized.startsWith('fe80')) return true;
  return false;
}

type ResolvedIssuer = {
  normalized: string;
  hostname: string;
  addresses: Array<{ address: string; family: 4 | 6 }>;
};

async function validateIssuerUrl(rawIssuer: string): Promise<ResolvedIssuer> {
  let url: URL;
  try {
    url = new URL(rawIssuer);
  } catch {
    throw new Error('Issuer URL must be a valid URL');
  }

  if (url.protocol !== 'https:') {
    throw new Error('Issuer URL must use https');
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('Issuer URL must be a public hostname');
  }

  const ipType = isIP(hostname);
  if (ipType === 4 && isPrivateIpv4(hostname)) {
    throw new Error('Issuer URL must be a public hostname');
  }
  if (ipType === 6 && isPrivateIpv6(hostname)) {
    throw new Error('Issuer URL must be a public hostname');
  }

  if (ipType === 0) {
    const records = await lookup(hostname, { all: true });
    if (!records.length) {
      throw new Error('Issuer URL host could not be resolved');
    }
    for (const record of records) {
      if (record.family === 4 && isPrivateIpv4(record.address)) {
        throw new Error('Issuer URL must be a public hostname');
      }
      if (record.family === 6 && isPrivateIpv6(record.address)) {
        throw new Error('Issuer URL must be a public hostname');
      }
    }
    return {
      normalized: normalizeIssuer(url.toString()),
      hostname,
      addresses: records.map((record) => ({
        address: record.address,
        family: record.family as 4 | 6
      }))
    };
  }

  return {
    normalized: normalizeIssuer(url.toString()),
    hostname,
    addresses: [{ address: hostname, family: ipType as 4 | 6 }]
  };
}

async function fetchWithPinnedIp(url: string, hostname: string, address: string, family: 4 | 6) {
  const dispatcher = new Agent({
    connect: {
      lookup: (_hostname, _options, callback) => {
        callback(null, address, family);
      },
      servername: hostname
    }
  });

  try {
    return await undiciFetch(url, {
      method: 'GET',
      headers: { host: hostname },
      dispatcher
    });
  } finally {
    dispatcher.close();
  }
}

async function testOpenIdConfiguration(issuer: string) {
  const resolved = await validateIssuerUrl(issuer);
  const endpoint = `${resolved.normalized}/.well-known/openid-configuration`;

  let lastError: Error | null = null;
  for (const record of resolved.addresses) {
    try {
      const response = await fetchWithPinnedIp(
        endpoint,
        resolved.hostname,
        record.address,
        record.family
      );
      if (!response.ok) {
        throw new Error(`OpenID discovery failed (${response.status})`);
      }
      return;
    } catch (error) {
      lastError = error as Error;
    }
  }

  throw lastError ?? new Error('OpenID discovery failed');
}

export async function updateSsoConfig(
  _prevState: SsoActionState,
  formData: FormData
): Promise<SsoActionState> {
  const session = await getServerAuthSession();
  if (!session?.user?.roles?.includes('admin')) {
    return { status: 'error', message: 'Unauthorized' };
  }

  const provider = ssoProviderSchema.safeParse(String(formData.get('provider') ?? ''));
  if (!provider.success) {
    return { status: 'error', message: 'Unknown provider' };
  }

  const intent = ssoIntentSchema.safeParse(String(formData.get('intent') ?? 'save'));
  if (!intent.success) {
    return { status: 'error', message: 'Invalid action' };
  }

  const enabled = formData.get('enabled') === 'on';
  const clientId = String(formData.get('clientId') ?? '').trim();
  const tenantId = String(formData.get('tenantId') ?? '').trim();
  const issuer = String(formData.get('issuer') ?? '').trim();
  const clientSecret = String(formData.get('clientSecret') ?? '').trim();
  const clearSecret = formData.get('clearSecret') === 'on';

  if (provider.data === 'credentials') {
    if (intent.data !== 'save') {
      return { status: 'error', message: 'Credentials does not support testing' };
    }
    await prisma.ssoConfig.upsert({
      where: { provider: 'credentials' },
      update: { enabled, config: Prisma.JsonNull, clientSecretEnc: null },
      create: { provider: 'credentials', enabled, config: Prisma.JsonNull }
    });
    await prisma.ssoAudit.create({
      data: {
        provider: 'credentials',
        action: 'save',
        actorId: session.user.id,
        changes: { enabled }
      }
    });
    revalidateTag('sso-config');
    revalidatePath('/admin');
    return { status: 'success', message: 'Credentials settings saved' };
  }

  const existing = await prisma.ssoConfig.findUnique({
    where: { provider: provider.data }
  });

  if (intent.data === 'test') {
    try {
      if (provider.data === 'azure-ad') {
        const payload = ssoAzureSchema.parse({
          provider: 'azure-ad',
          enabled,
          clientId,
          tenantId,
          clientSecret,
          clearSecret
        });
        const resolvedTenantId = payload.tenantId ||
          (existing?.config as Record<string, unknown> | null)?.tenantId;
        if (!resolvedTenantId) {
          return { status: 'error', message: 'Tenant ID is required to test' };
        }
        const issuerUrl = `https://login.microsoftonline.com/${resolvedTenantId}/v2.0`;
        await testOpenIdConfiguration(issuerUrl);

        const existingConfig = existing?.config as Record<string, unknown> | null;
        const config = {
          clientId: payload.clientId || (existingConfig?.clientId as string | undefined) || null,
          tenantId: payload.tenantId || (existingConfig?.tenantId as string | undefined) || null
        };

        if (payload.clientSecret && !hasSecretKey()) {
          return { status: 'error', message: 'SSO_MASTER_KEY is required to store secrets' };
        }

        const updateData: {
          enabled: boolean;
          config: Prisma.InputJsonValue | Prisma.NullTypes.JsonNull;
          clientSecretEnc?: string | null;
        } = {
          enabled: existing?.enabled ?? false,
          config: config.clientId || config.tenantId ? config : Prisma.JsonNull
        };

        if (payload.clearSecret) {
          updateData.clientSecretEnc = null;
        }
        if (payload.clientSecret) {
          updateData.clientSecretEnc = encryptSecret(payload.clientSecret);
        }

        await prisma.ssoConfig.upsert({
          where: { provider: 'azure-ad' },
          update: updateData,
          create: {
            provider: 'azure-ad',
            enabled: updateData.enabled,
            config: updateData.config,
            clientSecretEnc: updateData.clientSecretEnc ?? null
          }
        });
      } else {
        const payload = ssoKeycloakSchema.parse({
          provider: 'keycloak',
          enabled,
          clientId,
          issuer,
          clientSecret,
          clearSecret
        });
        const storedIssuer = (existing?.config as Record<string, unknown> | null)?.issuer;
        const resolvedIssuer = payload.issuer || (typeof storedIssuer === 'string' ? storedIssuer : '');
        if (!resolvedIssuer) {
          return { status: 'error', message: 'Issuer URL is required to test' };
        }
        await testOpenIdConfiguration(resolvedIssuer);

        const existingConfig = existing?.config as Record<string, unknown> | null;
        const config = {
          clientId: payload.clientId || (existingConfig?.clientId as string | undefined) || null,
          issuer: payload.issuer || (existingConfig?.issuer as string | undefined) || null
        };

        if (payload.clientSecret && !hasSecretKey()) {
          return { status: 'error', message: 'SSO_MASTER_KEY is required to store secrets' };
        }

        const updateData: {
          enabled: boolean;
          config: Prisma.InputJsonValue | Prisma.NullTypes.JsonNull;
          clientSecretEnc?: string | null;
        } = {
          enabled: existing?.enabled ?? false,
          config: config.clientId || config.issuer ? config : Prisma.JsonNull
        };

        if (payload.clearSecret) {
          updateData.clientSecretEnc = null;
        }
        if (payload.clientSecret) {
          updateData.clientSecretEnc = encryptSecret(payload.clientSecret);
        }

        await prisma.ssoConfig.upsert({
          where: { provider: 'keycloak' },
          update: updateData,
          create: {
            provider: 'keycloak',
            enabled: updateData.enabled,
            config: updateData.config,
            clientSecretEnc: updateData.clientSecretEnc ?? null
          }
        });
      }
    } catch (error) {
      return { status: 'error', message: error instanceof Error ? error.message : 'Test failed' };
    }
    revalidateTag('sso-config');
    revalidatePath('/admin');
    return { status: 'success', message: 'Connection test succeeded' };
  }

  if (!hasSecretKey() && clientSecret) {
    return { status: 'error', message: 'SSO_MASTER_KEY is required to save secrets' };
  }

  if (provider.data === 'azure-ad') {
    const payload = ssoAzureSchema.parse({
      provider: 'azure-ad',
      enabled,
      clientId,
      tenantId,
      clientSecret,
      clearSecret
    });

    if (payload.enabled) {
      if (!payload.clientId || !payload.tenantId) {
        return { status: 'error', message: 'Client ID and Tenant ID are required' };
      }
      const hasExistingSecret = Boolean(existing?.clientSecretEnc);
      if (!payload.clientSecret && !hasExistingSecret && !payload.clearSecret) {
        return { status: 'error', message: 'Client secret is required' };
      }
      if (payload.clearSecret && !payload.clientSecret) {
        return { status: 'error', message: 'Provide a new secret or uncheck clear' };
      }
    }

    const config = {
      clientId: payload.clientId || null,
      tenantId: payload.tenantId || null
    };

    const updateData: {
      enabled: boolean;
      config: Prisma.InputJsonValue | Prisma.NullTypes.JsonNull;
      clientSecretEnc?: string | null;
    } = {
      enabled: payload.enabled,
      config: payload.enabled ? config : Prisma.JsonNull
    };

    if (payload.clearSecret) {
      updateData.clientSecretEnc = null;
    }
    if (payload.clientSecret) {
      updateData.clientSecretEnc = encryptSecret(payload.clientSecret);
    }

    await prisma.ssoConfig.upsert({
      where: { provider: 'azure-ad' },
      update: updateData,
      create: {
        provider: 'azure-ad',
        enabled: payload.enabled,
        config: payload.enabled ? config : Prisma.JsonNull,
        clientSecretEnc: updateData.clientSecretEnc ?? null
      }
    });

    await prisma.ssoAudit.create({
      data: {
        provider: 'azure-ad',
        action: 'save',
        actorId: session.user.id,
        changes: {
          enabled: payload.enabled,
          config,
          secretUpdated: Boolean(payload.clientSecret) || payload.clearSecret
        }
      }
    });

    revalidateTag('sso-config');
    revalidatePath('/admin');
    return { status: 'success', message: 'Entra ID settings saved' };
  }

  const payload = ssoKeycloakSchema.parse({
    provider: 'keycloak',
    enabled,
    clientId,
    issuer,
    clientSecret,
    clearSecret
  });

  if (payload.enabled) {
    if (!payload.clientId || !payload.issuer) {
      return { status: 'error', message: 'Client ID and Issuer are required' };
    }
    const hasExistingSecret = Boolean(existing?.clientSecretEnc);
    if (!payload.clientSecret && !hasExistingSecret && !payload.clearSecret) {
      return { status: 'error', message: 'Client secret is required' };
    }
    if (payload.clearSecret && !payload.clientSecret) {
      return { status: 'error', message: 'Provide a new secret or uncheck clear' };
    }
  }

  const config = {
    clientId: payload.clientId || null,
    issuer: payload.issuer ? normalizeIssuer(payload.issuer) : null
  };

  const updateData: {
    enabled: boolean;
    config: Prisma.InputJsonValue | Prisma.NullTypes.JsonNull;
    clientSecretEnc?: string | null;
  } = {
    enabled: payload.enabled,
    config: payload.enabled ? config : Prisma.JsonNull
  };

  if (payload.clearSecret) {
    updateData.clientSecretEnc = null;
  }
  if (payload.clientSecret) {
    updateData.clientSecretEnc = encryptSecret(payload.clientSecret);
  }

  await prisma.ssoConfig.upsert({
    where: { provider: 'keycloak' },
    update: updateData,
    create: {
      provider: 'keycloak',
      enabled: payload.enabled,
      config: payload.enabled ? config : Prisma.JsonNull,
      clientSecretEnc: updateData.clientSecretEnc ?? null
    }
  });

  await prisma.ssoAudit.create({
    data: {
      provider: 'keycloak',
      action: 'save',
      actorId: session.user.id,
      changes: {
        enabled: payload.enabled,
        config,
        secretUpdated: Boolean(payload.clientSecret) || payload.clearSecret
      }
    }
  });

  revalidateTag('sso-config');
  revalidatePath('/admin');
  return { status: 'success', message: 'Keycloak settings saved' };
}
