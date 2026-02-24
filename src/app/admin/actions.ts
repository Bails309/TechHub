'use server';

import { z } from 'zod';
import path from 'path';
import { saveIcon as storageSaveIcon, deleteIcon as storageDeleteIcon } from '@/lib/storage';
import { revalidatePath, revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { getServerAuthSession } from '@/lib/auth';
import { encryptSecret, hasSecretKey } from '@/lib/crypto';
// SSO rotation removed: previously used rotateSsoSecrets utilities
import { hashPassword, validatePasswordComplexity } from '@/lib/password';
import { getPasswordPolicy } from '@/lib/passwordPolicy';
import { lookup } from 'dns/promises';
import https from 'https';
import ipaddr from 'ipaddr.js';

const appSchemaBase = z.object({
  name: z.string().min(2),
  url: z
    .string()
    .url()
    .refine((value) => value.startsWith('http://') || value.startsWith('https://'), {
      message: 'URL must use http or https'
    }),
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
    return ALLOWED_ICON_EXTENSIONS.has(extension) && ALLOWED_ICON_MIME_TYPES.has(file.type);
  }, { message: 'Invalid file type' });

async function saveIcon(file: File) {
  const parsed = uploadSchema.safeParse(file);
  if (!parsed.success) return undefined;
  return storageSaveIcon(file);
}

async function safeDeleteIcon(iconPath?: string) {
  if (!iconPath) return;
  try {
    await storageDeleteIcon(iconPath);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('Failed to delete old icon', iconPath, err);
  }
}

export async function createApp(formData: FormData) {
  const session = await getServerAuthSession();
  if (!session?.user?.roles?.includes('admin')) {
    throw new Error('Unauthorized');
  }
  if (session?.user?.mustChangePassword && session.user.authProvider === 'credentials') {
    throw new Error('Unauthorized: must_change_password');
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

  try {
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
  } catch (err) {
    // If the DB transaction failed, remove any uploaded icon to avoid orphaned files
    if (iconPath) await safeDeleteIcon(iconPath);
    throw err;
  }

  revalidatePath('/admin');
  revalidatePath('/');
}

export async function deleteApp(formData: FormData) {
  const session = await getServerAuthSession();
  if (!session?.user?.roles?.includes('admin')) {
    throw new Error('Unauthorized');
  }
  if (session?.user?.mustChangePassword && session.user.authProvider === 'credentials') {
    throw new Error('Unauthorized: must_change_password');
  }
  

  const id = String(formData.get('id') ?? '');
  if (!id) {
    return;
  }

  // fetch existing record so we can remove uploaded icon file afterwards
  const app = await prisma.appLink.findUnique({ where: { id } });

  await prisma.appLink.delete({ where: { id } });

  // delete uploaded icon file if present
  if (app?.icon) {
    await safeDeleteIcon(app.icon);
  }

  revalidatePath('/admin');
  revalidatePath('/');
}

export async function updateApp(formData: FormData) {
  const session = await getServerAuthSession();
  if (!session?.user?.roles?.includes('admin')) {
    throw new Error('Unauthorized');
  }
  if (session?.user?.mustChangePassword && session.user.authProvider === 'credentials') {
    throw new Error('Unauthorized: must_change_password');
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

  // Fetch existing icon path so we can remove the old file after successful update
  const existingApp = await prisma.appLink.findUnique({ where: { id: payload.id } });

  try {
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
  } catch (err) {
    // If update failed, and we uploaded a new icon, remove it to avoid orphaned files
    if (iconPath && existingApp?.icon !== iconPath) {
      await safeDeleteIcon(iconPath);
    }
    throw err;
  }

  // After successful transaction, delete old icon file when appropriate
  if (existingApp?.icon) {
    if (iconRemove) {
      await safeDeleteIcon(existingApp.icon);
    } else if (iconPath && existingApp.icon !== iconPath) {
      await safeDeleteIcon(existingApp.icon);
    }
  }

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
  if (session?.user?.mustChangePassword && session.user.authProvider === 'credentials') {
    throw new Error('Unauthorized: must_change_password');
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

export async function deleteUser(formData: FormData) {
  const session = await getServerAuthSession();
  if (!session?.user?.roles?.includes('admin')) {
    throw new Error('Unauthorized');
  }
  if (session?.user?.mustChangePassword && session.user.authProvider === 'credentials') {
    throw new Error('Unauthorized: must_change_password');
  }

  const userId = String(formData.get('userId') ?? '').trim();
  if (!userId) return;

  const confirmEmail = String(formData.get('confirmEmail') ?? '').trim().toLowerCase();

  // Validate confirmation matches target user's email
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return;
  const targetEmail = (target.email ?? '').toLowerCase();
  if (!confirmEmail || confirmEmail !== targetEmail) {
    // treat as unauthorized/missing confirmation
    redirect('/admin?error=confirm-delete');
  }

  // Prevent deleting your own account from the admin dashboard
  if (userId === session.user.id) {
    redirect('/admin?error=self-delete');
  }

  // Prevent deleting the last admin — use a transaction with a row-level lock
  // on the admin role to avoid a race condition where two concurrent deletes
  // could both observe adminCount === 1.
  const adminRole = await prisma.role.findUnique({ where: { name: 'admin' } });
  if (adminRole) {
    try {
      await prisma.$transaction(async (tx) => {
        // Lock the role row so concurrent transactions serialize here.
        await tx.$queryRaw`
          SELECT id FROM "Role" WHERE id = ${adminRole.id} FOR UPDATE
        `;

        const adminCount = await tx.userRole.count({ where: { roleId: adminRole.id } });
        const targetIsAdmin = await tx.userRole.findFirst({ where: { userId, roleId: adminRole.id } });
        if (targetIsAdmin && adminCount <= 1) {
          // Signal to outer scope that deletion is not allowed
          throw new Error('last-admin');
        }

        await tx.user.delete({ where: { id: userId } });
      });
    } catch (err) {
      if ((err as Error).message === 'last-admin') {
        redirect('/admin?error=last-admin');
      }
      throw err;
    }
  } else {
    await prisma.user.delete({ where: { id: userId } });
  }

  revalidatePath('/admin');
  revalidatePath('/');
}

const roleSchema = z.object({
  name: z.string().min(2).max(48)
});

export async function createRole(formData: FormData) {
  const session = await getServerAuthSession();
  if (!session?.user?.roles?.includes('admin')) {
    throw new Error('Unauthorized');
  }
  if (session?.user?.mustChangePassword && session.user.authProvider === 'credentials') {
    throw new Error('Unauthorized: must_change_password');
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
  if (session?.user?.mustChangePassword && session.user.authProvider === 'credentials') {
    throw new Error('Unauthorized: must_change_password');
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
  if (session?.user?.mustChangePassword && session.user.authProvider === 'credentials') {
    return { status: 'error', message: 'Unauthorized: must_change_password' };
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
  if (session?.user?.mustChangePassword && session.user.authProvider === 'credentials') {
    throw new Error('Unauthorized: must_change_password');
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
  if (session?.user?.mustChangePassword && session.user.authProvider === 'credentials') {
    throw new Error('Unauthorized: must_change_password');
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

function isPublicIp(address: string) {
  try {
    const parsed = ipaddr.process(address);
    return parsed.range() === 'unicast';
  } catch {
    return false;
  }
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

  const isIpLiteral = ipaddr.isValid(hostname);
  if (isIpLiteral && !isPublicIp(hostname)) {
    throw new Error('Issuer URL must be a public hostname');
  }

  if (!isIpLiteral) {
    const records = await lookup(hostname, { all: true, verbatim: true });
    if (!records.length) {
      throw new Error('Issuer URL host could not be resolved');
    }
    const validRecords = records
      .filter((record) => Boolean(record.address) && (record.family === 4 || record.family === 6))
      .map((record) => ({ address: String(record.address), family: record.family as 4 | 6 }));

    if (!validRecords.length) {
      throw new Error('Issuer URL host resolved to no valid IPs');
    }

    for (const rec of validRecords) {
      if (!isPublicIp(rec.address)) {
        throw new Error('Issuer URL must be a public hostname');
      }
    }

    // Deduplicate by address
    const seen = new Set<string>();
    const uniqueRecords: Array<{ address: string; family: 4 | 6 }> = [];
    for (const rec of validRecords) {
      if (!seen.has(rec.address)) {
        seen.add(rec.address);
        uniqueRecords.push(rec);
      }
    }

    return {
      normalized: normalizeIssuer(url.toString()),
      hostname,
      addresses: uniqueRecords.map((rec) => ({
        address: ipaddr.process(rec.address).toNormalizedString(),
        family: rec.family
      }))
    };
  }

  const literal = ipaddr.process(hostname);
  return {
    normalized: normalizeIssuer(url.toString()),
    hostname,
    addresses: [{ address: hostname, family: literal.kind() === 'ipv6' ? 6 : 4 }]
  };
}

async function fetchWithPinnedIp(url: string, hostname: string, address: string) {
  if (!address) {
    throw new Error('Resolved IP address is missing');
  }
  if (!ipaddr.isValid(address)) {
    throw new Error(`Resolved IP address is invalid: ${address}`);
  }
  const parsed = ipaddr.process(address);
  const resolvedAddress = parsed.toNormalizedString();
  const target = new URL(url);

  return await new Promise<{ ok: boolean; status: number }>((resolve, reject) => {
    // Connect directly to the resolved IP address and use the original hostname for SNI
    // and the Host header. This avoids relying on a custom lookup callback which
    // can surface ERR_INVALID_IP_ADDRESS in some environments.
    const requestOptions: https.RequestOptions = {
      protocol: target.protocol,
      hostname: resolvedAddress,
      port: target.port || 443,
      path: `${target.pathname}${target.search}`,
      method: 'GET',
      headers: { host: hostname },
      servername: hostname
    };

    const request = https.request(requestOptions, (response) => {
      const status = response.statusCode ?? 0;
      response.resume();
      resolve({ ok: status >= 200 && status < 300, status });
    });

    request.on('error', (err) => {
      reject(err instanceof Error ? err : new Error(String(err)));
    });

    request.end();
  });
}

function formatFetchError(error: unknown) {
  if (!(error instanceof Error)) {
    return 'Unknown error';
  }
  const cause = (error as { cause?: { code?: string; message?: string } }).cause;
  const suffix = cause?.code ? ` (${cause.code})` : '';
  return `${error.message}${suffix}`;
}

async function testOpenIdConfiguration(issuer: string) {
  const resolved = await validateIssuerUrl(issuer);
  const endpoint = `${resolved.normalized}/.well-known/openid-configuration`;
  const orderedAddresses = [...resolved.addresses].sort((a, b) => a.family - b.family);

  let lastError: Error | null = null;
  let lastAddress: string | null = null;
  for (const record of orderedAddresses) {
    if (!record?.address) {
      // skip invalid entries defensively
      continue;
    }
    if (!ipaddr.isValid(record.address)) {
      // skip entries that aren't valid IPs
      lastAddress = record.address ?? null;
      lastError = new Error('Resolved address is not a valid IP');
      continue;
    }
    try {
      const response = await fetchWithPinnedIp(endpoint, resolved.hostname, record.address);
      if (!response.ok) {
        throw new Error(`OpenID discovery failed (${response.status})`);
      }
      return;
    } catch (error) {
      lastError = error as Error;
      lastAddress = record.address;
    }
  }

  if (lastError) {
    const detail = formatFetchError(lastError);
    const suffix = lastAddress ? ` (last address: ${lastAddress})` : '';
    throw new Error(`OpenID discovery failed: ${detail}${suffix}`);
  }

  throw new Error('OpenID discovery failed');
}

export async function updateSsoConfig(
  _prevState: SsoActionState,
  formData: FormData
): Promise<SsoActionState> {
  const session = await getServerAuthSession();
  if (!session?.user?.roles?.includes('admin')) {
    return { status: 'error', message: 'Unauthorized' };
  }

  if (session?.user?.mustChangePassword && session.user.authProvider === 'credentials') {
    return { status: 'error', message: 'Unauthorized: must_change_password' };
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

// Rotation actions removed — managed by single SSO_MASTER_KEY now.
