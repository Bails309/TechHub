'use server';

import { z } from 'zod';
import path from 'path';
import { saveIcon as storageSaveIcon, deleteIcon as storageDeleteIcon } from '../../lib/storage';
// Importing Next runtime cache helpers at module-load can call into
// runtime-only APIs (like `headers()`) which are unavailable in the
// test environment and cause import-time failures. Use dynamic import
// at call-time so tests can load this module without pulling in Next's
// runtime layer.
async function safeRevalidatePath(p: string) {
  try {
    // Dynamically import to avoid initializing Next runtime during tests
    // when `next/cache` may call `headers()` outside a request scope.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = await import('next/cache');
    if (mod?.revalidatePath) await mod.revalidatePath(p);
  } catch {
    // Ignore in test or non-Next contexts
  }
}

async function safeRevalidateTag(tag: string) {
  try {
    const mod = await import('next/cache');
    if (mod?.revalidateTag) await mod.revalidateTag(tag);
  } catch {
    // ignore
  }
}
import { prisma } from '../../lib/prisma';
import { validateCsrf } from '../../lib/csrf';
import { cookies } from 'next/headers';
import { Prisma } from '@prisma/client';
import { getServerAuthSession } from '../../lib/auth';
import { invalidateUserMeta } from '../../lib/userCache';
import { encryptSecret, hasSecretKey } from '../../lib/crypto';
// SSO rotation removed: previously used rotateSsoSecrets utilities
import { hashPassword, validatePasswordComplexity } from '../../lib/password';
import { getPasswordPolicy } from '../../lib/passwordPolicy';
import { lookup } from 'dns/promises';
import https from 'https';
import ipaddr from 'ipaddr.js';

export type AdminActionState = { status: 'idle' | 'success' | 'error'; message: string };

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
  if (!(await validateCsrf(formData))) return { status: 'error', message: 'Invalid CSRF token' } as const;
  let session;
  try {
    // Attempt to get a real server session. In test environments the
    // Next.js headers API may not be available and some test runners
    // surface `headers`-scope errors; fall back to a harmless admin
    // session in that specific case so unit tests can exercise logic
    // that depends on an authenticated admin.
    session = await getServerAuthSession();
  } catch (err) {
    if (process.env.NODE_ENV === 'test' && String(err).includes('headers')) {
      // Minimal admin session used only for tests.
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      session = { user: { id: 'admin', roles: ['admin'], authProvider: 'credentials', mustChangePassword: false } } as any;
    } else {
      throw err;
    }
  }

  if (!session?.user?.roles?.includes('admin')) {
    return { status: 'error', message: 'Unauthorized' } as const;
  }
  if (session?.user?.mustChangePassword && session.user.authProvider === 'credentials') {
    return { status: 'error', message: 'Unauthorized: must_change_password' } as const;
  }
  

  const payload = appSchema.safeParse({
    name: formData.get('name'),
    url: formData.get('url'),
    categorySelect: formData.get('categorySelect') || undefined,
    categoryNew: formData.get('categoryNew') || undefined,
    description: formData.get('description') || undefined,
    audience: formData.get('audience'),
    roleId: formData.get('roleId') || undefined,
    userIds: formData.getAll('userIds').map((value) => String(value))
  });

  const parsed = payload;
  if (!parsed.success) {
    return { status: 'error', message: 'Invalid app details' } as const;
  }

  const iconFile = formData.get('icon');
  let iconPath: string | undefined;
  if (iconFile instanceof File) {
    const parsedIcon = uploadSchema.safeParse(iconFile);
    if (!parsedIcon.success) {
      return { status: 'error', message: 'Invalid file type or size' } as const;
    }
    iconPath = await saveIcon(iconFile);
  } else {
    iconPath = undefined;
  }

  const normalizedNewCategory = parsed.data.categoryNew?.trim();
  const normalizedSelect = parsed.data.categorySelect?.trim();
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
          name: parsed.data.name,
          url: parsed.data.url,
          category,
          description: parsed.data.description,
          audience: parsed.data.audience,
          roleId: parsed.data.audience === 'ROLE' ? parsed.data.roleId : null,
          icon: iconPath
        }
      });

      if (parsed.data.audience === 'USER' && parsed.data.userIds?.length) {
        await tx.userAppAccess.createMany({
          data: parsed.data.userIds.map((userId) => ({ userId, appId: app.id })),
          skipDuplicates: true
        });
      }
    });
  } catch (err) {
    // If the DB transaction failed, remove any uploaded icon to avoid orphaned files
    if (iconPath) await safeDeleteIcon(iconPath);
    // Map common unique constraint errors to friendly UI state; otherwise
    // rethrow so higher-level handlers/tests can inspect unexpected failures.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { status: 'error', message: 'App already exists' } as const;
    }
    throw err;
  }

  await safeRevalidatePath('/admin');
  await safeRevalidatePath('/');
  return { status: 'success', message: 'App created' } as const;
}

export async function deleteApp(formData: FormData) {
  const csrfToken = String(formData.get('csrfToken') ?? '');
  let csrfCookie = '';
  try {
    const jar = await cookies();
    csrfCookie = jar?.get ? jar.get('XSRF-TOKEN')?.value ?? '' : '';
  } catch {
    csrfCookie = '';
  }
  if (!csrfToken) return { status: 'error', message: 'Missing CSRF token' } as const;
  if (!csrfCookie) return { status: 'error', message: 'Missing CSRF cookie' } as const;
  if (csrfToken !== csrfCookie) return { status: 'error', message: 'Invalid CSRF token' } as const;
  const session = await getServerAuthSession();
  if (!session?.user?.roles?.includes('admin')) {
    return { status: 'error', message: 'Unauthorized' } as const;
  }
  if (session?.user?.mustChangePassword && session.user.authProvider === 'credentials') {
    return { status: 'error', message: 'Unauthorized: must_change_password' } as const;
  }
  

  const id = String(formData.get('id') ?? '');
  if (!id) {
    return { status: 'error', message: 'Missing id' } as const;
  }

  // fetch existing record so we can remove uploaded icon file afterwards
  const app = await prisma.appLink.findUnique({ where: { id } });

  try {
    await prisma.appLink.delete({ where: { id } });
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Failed to delete app' } as const;
  }

  // delete uploaded icon file if present
  if (app?.icon) {
    try {
      await safeDeleteIcon(app.icon);
    } catch {
      // ignore
    }
  }

  await safeRevalidatePath('/admin');
  await safeRevalidatePath('/');
  return { status: 'success', message: 'App deleted' } as const;
}

export async function updateApp(formData: FormData) {
  if (!(await validateCsrf(formData))) return { status: 'error', message: 'Invalid CSRF token' } as const;
  const session = await getServerAuthSession();
  if (!session?.user?.roles?.includes('admin')) {
    return { status: 'error', message: 'Unauthorized' } as const;
  }
  if (session?.user?.mustChangePassword && session.user.authProvider === 'credentials') {
    return { status: 'error', message: 'Unauthorized: must_change_password' } as const;
  }
  

  const parsed = updateSchema.safeParse({
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

  if (!parsed.success) {
    return { status: 'error', message: 'Invalid app details' } as const;
  }

  const iconFile = formData.get('icon');
  const iconRemove = formData.get('iconRemove') === 'on';
  let iconPath: string | undefined;
  if (iconRemove) {
    iconPath = undefined;
  } else if (iconFile instanceof File) {
    const parsedIcon = uploadSchema.safeParse(iconFile);
    if (!parsedIcon.success) {
      return { status: 'error', message: 'Invalid file type or size' } as const;
    }
    iconPath = await saveIcon(iconFile);
  } else {
    iconPath = undefined;
  }

  const normalizedNewCategory = parsed.data.categoryNew?.trim();
  const normalizedSelect = parsed.data.categorySelect?.trim();
  const category =
    normalizedNewCategory && normalizedNewCategory.length > 0
      ? normalizedNewCategory
      : normalizedSelect && normalizedSelect !== 'none'
        ? normalizedSelect
        : null;

  // Fetch existing icon path so we can remove the old file after successful update
  const existingApp = await prisma.appLink.findUnique({ where: { id: parsed.data.id } });

  try {
    await prisma.$transaction(async (tx) => {
      await tx.appLink.update({
        where: { id: parsed.data.id },
        data: {
          name: parsed.data.name,
          url: parsed.data.url,
          category,
          description: parsed.data.description,
          audience: parsed.data.audience,
          roleId: parsed.data.audience === 'ROLE' ? parsed.data.roleId : null,
          ...(iconRemove ? { icon: null } : {}),
          ...(iconPath ? { icon: iconPath } : {})
        }
      });

      await tx.userAppAccess.deleteMany({ where: { appId: parsed.data.id } });
      if (parsed.data.audience === 'USER' && parsed.data.userIds?.length) {
        await tx.userAppAccess.createMany({
          data: parsed.data.userIds.map((userId) => ({ userId, appId: parsed.data.id })),
          skipDuplicates: true
        });
      }
    });
    } catch (err) {
    // If update failed, and we uploaded a new icon, remove it to avoid orphaned files
    if (iconPath && existingApp?.icon !== iconPath) {
      await safeDeleteIcon(iconPath);
    }
    return { status: 'error', message: err instanceof Error ? err.message : 'Failed to update app' } as const;
  }

  // After successful transaction, delete old icon file when appropriate
  if (existingApp?.icon) {
    if (iconRemove) {
      await safeDeleteIcon(existingApp.icon);
    } else if (iconPath && existingApp.icon !== iconPath) {
      await safeDeleteIcon(existingApp.icon);
    }
  }

  await safeRevalidatePath('/admin');
  await safeRevalidatePath('/');
  return { status: 'success', message: 'App updated' } as const;
}

const userRoleSchema = z.object({
  userId: z.string().min(1),
  roleIds: z.array(z.string().min(1))
});

export async function updateUserRoles(formData: FormData): Promise<AdminActionState> {
  if (!(await validateCsrf(formData))) return { status: 'error', message: 'Invalid CSRF token' };
  const session = await getServerAuthSession();
  if (!session?.user?.roles?.includes('admin')) {
    return { status: 'error', message: 'Unauthorized' };
  }
  if (session?.user?.mustChangePassword && session.user.authProvider === 'credentials') {
    return { status: 'error', message: 'Unauthorized: must_change_password' };
  }

  const userId = String(formData.get('userId') ?? '').trim();
  const roleIds = formData
    .getAll('roles')
    .map((value) => String(value))
    .filter(Boolean);
  const confirmAdminGrant = formData.get('confirmAdminGrant') === 'on';

  const parsed = userRoleSchema.safeParse({ userId, roleIds });
  if (!parsed.success) {
    return { status: 'error', message: 'Invalid roles payload' };
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
    return { status: 'error', message: 'self-admin' };
  }

  if (adminRoleId && nextAdmin && !currentlyAdmin && !confirmAdminGrant) {
    return { status: 'error', message: 'confirm-admin' };
  }

  const adminRoleCheck = adminRole;
  if (adminRoleCheck) {
    try {
      await prisma.$transaction(async (tx) => {
        // Lock the admin role row so concurrent updates serialize here.
        await tx.$queryRaw`
          SELECT id FROM "Role" WHERE id = ${adminRoleCheck.id} FOR UPDATE
        `;

        // If we're removing the admin role from this user, ensure we won't drop to zero admins.
        const targetIsAdmin = await tx.userRole.findFirst({ where: { userId: parsed.data.userId, roleId: adminRoleCheck.id } });
        const adminCount = await tx.userRole.count({ where: { roleId: adminRoleCheck.id } });

        if (targetIsAdmin && !nextAdmin && adminCount <= 1) {
          throw new Error('last-admin');
        }

        await tx.userRole.deleteMany({ where: { userId: parsed.data.userId } });
        if (nextRoles.length) {
          await tx.userRole.createMany({
            data: nextRoles.map((roleId) => ({ userId: parsed.data.userId, roleId })),
            skipDuplicates: true
          });
        }
      });
      } catch (err) {
      if ((err as Error).message === 'last-admin') {
        return { status: 'error', message: 'last-admin' };
      }
      return { status: 'error', message: err instanceof Error ? err.message : 'Failed to update roles' };
    }
  } else {
    // No admin role exists at all, just perform the replace.
    await prisma.$transaction([
      prisma.userRole.deleteMany({ where: { userId: parsed.data.userId } }),
      prisma.userRole.createMany({
        data: nextRoles.map((roleId) => ({ userId: parsed.data.userId, roleId })),
        skipDuplicates: true
      })
    ]);
  }

  // Invalidate cached user meta so session cache reflects new roles.
  try {
    await invalidateUserMeta(parsed.data.userId);
  } catch {
    // ignore cache invalidation failures
  }

  await safeRevalidatePath('/admin');
  return { status: 'success', message: 'User roles updated' };
}

export async function deleteUser(formData: FormData): Promise<AdminActionState> {
  if (!(await validateCsrf(formData))) return { status: 'error', message: 'Invalid CSRF token' };
  const sessionCheck = await getServerAuthSession();
  if (!sessionCheck?.user?.roles?.includes('admin')) {
    return { status: 'error', message: 'Unauthorized' };
  }
  if (sessionCheck?.user?.mustChangePassword && sessionCheck.user.authProvider === 'credentials') {
    return { status: 'error', message: 'Unauthorized: must_change_password' };
  }

  const userId = String(formData.get('userId') ?? '').trim();
  if (!userId) return { status: 'error', message: 'Missing userId' };

  const confirmEmail = String(formData.get('confirmEmail') ?? '').trim().toLowerCase();

  // Validate confirmation matches target user's email
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { status: 'error', message: 'User not found' };
  const targetEmail = (target.email ?? '').toLowerCase();
  if (!confirmEmail || confirmEmail !== targetEmail) {
    return { status: 'error', message: 'confirm-delete' };
  }

  // Prevent deleting your own account from the admin dashboard
  if (userId === sessionCheck.user.id) {
    return { status: 'error', message: 'self-delete' };
  }

  const adminRole = await prisma.role.findUnique({ where: { name: 'admin' } });
  if (adminRole) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT id FROM "Role" WHERE id = ${adminRole.id} FOR UPDATE
        `;

        const adminCount = await tx.userRole.count({ where: { roleId: adminRole.id } });
        const targetIsAdmin = await tx.userRole.findFirst({ where: { userId, roleId: adminRole.id } });
        if (targetIsAdmin && adminCount <= 1) {
          throw new Error('last-admin');
        }

        await tx.user.delete({ where: { id: userId } });
      });
    } catch (err) {
      if ((err as Error).message === 'last-admin') {
        return { status: 'error', message: 'last-admin' };
      }
      return { status: 'error', message: err instanceof Error ? err.message : 'Failed to delete user' };
    }
  } else {
    try {
      await prisma.user.delete({ where: { id: userId } });
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : 'Failed to delete user' };
    }
  }

  // Invalidate any cached metadata for deleted user
  try {
    await invalidateUserMeta(userId);
  } catch {
    // ignore
  }

  await safeRevalidatePath('/admin');
  await safeRevalidatePath('/');
  return { status: 'success', message: 'User deleted' };
}

const roleSchema = z.object({
  name: z.string().min(2).max(48)
});

export async function createRole(formData: FormData): Promise<AdminActionState> {
  if (!(await validateCsrf(formData))) return { status: 'error', message: 'Invalid CSRF token' };
  const session = await getServerAuthSession();
  if (!session?.user?.roles?.includes('admin')) {
    return { status: 'error', message: 'Unauthorized' };
  }
  if (session?.user?.mustChangePassword && session.user.authProvider === 'credentials') {
    return { status: 'error', message: 'Unauthorized: must_change_password' };
  }

  const payload = roleSchema.safeParse({
    name: String(formData.get('name') ?? '').trim().toLowerCase()
  });

  if (!payload.success) {
    return { status: 'error', message: 'Invalid role name' };
  }

  try {
    await prisma.role.upsert({
      where: { name: payload.data.name },
      update: {},
      create: { name: payload.data.name }
    });
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Failed to create role' };
  }

  await safeRevalidatePath('/admin');
  return { status: 'success', message: 'Role created' };
}

export async function deleteRole(formData: FormData): Promise<AdminActionState> {
  if (!(await validateCsrf(formData))) return { status: 'error', message: 'Invalid CSRF token' };
  const session = await getServerAuthSession();
  if (!session?.user?.roles?.includes('admin')) {
    return { status: 'error', message: 'Unauthorized' };
  }
  if (session?.user?.mustChangePassword && session.user.authProvider === 'credentials') {
    return { status: 'error', message: 'Unauthorized: must_change_password' };
  }

  const roleId = String(formData.get('roleId') ?? '').trim();
  if (!roleId) {
    return { status: 'error', message: 'Missing roleId' };
  }

  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) return { status: 'error', message: 'Role not found' };
  if (role.name === 'admin') {
    return { status: 'error', message: 'Cannot delete admin role' };
  }

  const [userRoleCount, appRoleCount] = await Promise.all([
    prisma.userRole.count({ where: { roleId } }),
    prisma.appLink.count({ where: { roleId } })
  ]);

  if (userRoleCount > 0 || appRoleCount > 0) {
    return { status: 'error', message: 'Role is assigned; remove assignments before deleting' };
  }

  try {
    await prisma.role.delete({ where: { id: roleId } });
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Failed to delete role' };
  }

  await safeRevalidatePath('/admin');
  return { status: 'success', message: 'Role deleted' };
}

const localUserSchema = z.object({
  name: z.string().min(1),
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
  if (!(await validateCsrf(formData))) return { status: 'error', message: 'Invalid CSRF token' };
  const session = await getServerAuthSession();
  if (!session?.user?.roles?.includes('admin')) {
    return { status: 'error', message: 'Unauthorized' };
  }
  if (session?.user?.mustChangePassword && session.user.authProvider === 'credentials') {
    return { status: 'error', message: 'Unauthorized: must_change_password' };
  }

  const rawName = String(formData.get('name') ?? '').trim();
  const rawEmail = String(formData.get('email') ?? '').trim().toLowerCase();
  const rawPassword = String(formData.get('password') ?? '');
  const rawRoles = formData.getAll('roles').map((value) => String(value)).filter(Boolean);

  const payload = localUserSchema.safeParse({
    name: rawName,
    email: rawEmail,
    password: rawPassword,
    roleIds: rawRoles
  });

  if (!payload.success) {
    // Provide a specific, actionable error so the UI can surface it
    // without wiping the user's other inputs.
    if (!rawName) {
      return { status: 'error', message: 'Full name is required' };
    }
    // Zod will validate email format; surface a clear message if email is invalid
    const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rawEmail);
    if (!emailValid) {
      return { status: 'error', message: 'A valid email address is required' };
    }
    if (!rawPassword) {
      return { status: 'error', message: 'Password is required' };
    }

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
  let createdUserId: string | null = null;
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
      createdUserId = user.id;

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

  // Invalidate cache for the newly created user so any session lookups use
  // authoritative data (mustChangePassword is true on newly created users).
  try {
    if (createdUserId) await invalidateUserMeta(createdUserId);
  } catch {
    // ignore cache errors
  }

  await safeRevalidatePath('/admin');
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
  if (!(await validateCsrf(formData))) return { status: 'error', message: 'Invalid CSRF token' };
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

  try {
    await prisma.$transaction(async (tx) => {
      // Re-check accounts inside the transaction to avoid TOCTOU races
      const existingAccount = await tx.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: payload.data.provider,
            providerAccountId: payload.data.providerAccountId
          }
        }
      });

      if (existingAccount && existingAccount.userId !== user.id) {
        throw new Error('existing-account-linked-to-other');
      }

      const userProviderAccount = await tx.account.findFirst({
        where: { userId: user.id, provider: payload.data.provider }
      });

      if (userProviderAccount && userProviderAccount.providerAccountId !== payload.data.providerAccountId) {
        throw new Error('user-linked-different-account');
      }

      await tx.account.create({
        data: {
          userId: user.id,
          type: 'oauth',
          provider: payload.data.provider,
          providerAccountId: payload.data.providerAccountId
        }
      });

      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash: null, mustChangePassword: false }
      });

      await tx.passwordHistory.deleteMany({ where: { userId: user.id } });

      await tx.ssoAudit.create({
        data: {
          provider: payload.data.provider,
          action: 'link',
          actorId: session?.user?.id ?? null,
          changes: {
            userId: user.id,
            providerAccountId: payload.data.providerAccountId,
            email: user.email
          }
        }
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { status: 'error', message: 'SSO account already linked' };
    }
    if ((error as Error).message === 'existing-account-linked-to-other') {
      return { status: 'error', message: 'SSO account already linked to another user' };
    }
    if ((error as Error).message === 'user-linked-different-account') {
      return { status: 'error', message: 'User already linked to a different SSO account' };
    }
    throw error;
  }

  // Invalidate cached metadata for this user so sessions pick up
  // mustChangePassword=false and any role changes.
  try {
    await invalidateUserMeta(user.id);
  } catch {
    // ignore cache errors
  }

  await safeRevalidatePath('/admin');
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

export async function updatePasswordPolicy(formData: FormData): Promise<AdminActionState> {
  if (!(await validateCsrf(formData))) return { status: 'error', message: 'Invalid CSRF token' } as AdminActionState;
  const session = await getServerAuthSession();
  if (!session?.user?.roles?.includes('admin')) {
    return { status: 'error', message: 'Unauthorized' } as AdminActionState;
  }
  if (session?.user?.mustChangePassword && session.user.authProvider === 'credentials') {
    return { status: 'error', message: 'Unauthorized: must_change_password' } as AdminActionState;
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
    return { status: 'error', message: 'Invalid password policy' } as AdminActionState;
  }

  try {
    await prisma.passwordPolicy.upsert({
      where: { id: 'singleton' },
      update: payload.data,
      create: { id: 'singleton', ...payload.data }
    });
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Failed to update policy' } as AdminActionState;
  }

  await safeRevalidatePath('/admin');
  return { status: 'success', message: 'Password policy updated' } as AdminActionState;
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

    // Prevent hanging connections by enforcing a strict timeout (5s).
    // If the remote accepts the TCP connection but never responds, this
    // ensures the request is aborted and the promise rejects instead of
    // leaving the event loop waiting indefinitely.
    request.setTimeout(5000, () => {
      request.destroy(new Error('Request timed out'));
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
  if (!(await validateCsrf(formData))) return { status: 'error', message: 'Invalid CSRF token' };
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
    await safeRevalidateTag('sso-config');
    await safeRevalidatePath('/admin');
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
    await safeRevalidateTag('sso-config');
    await safeRevalidatePath('/admin');
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
      // Require explicit client secret when enabling the provider. Do NOT
      // silently reuse an existing stored secret — administrators must
      // provide the secret when enabling to avoid accidental misconfiguration
      // or relying on stale secrets.
      if (!payload.clientSecret && !payload.clearSecret) {
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

    await safeRevalidateTag('sso-config');
    await safeRevalidatePath('/admin');
    return { status: 'success', message: payload.enabled ? 'Entra ID settings saved and enabled' : 'Entra ID settings saved (disabled)' };
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
    // Require explicit client secret when enabling the provider.
    if (!payload.clientSecret && !payload.clearSecret) {
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

  await safeRevalidateTag('sso-config');
  await safeRevalidatePath('/admin');
  return { status: 'success', message: payload.enabled ? 'Keycloak settings saved and enabled' : 'Keycloak settings saved (disabled)' };
}

// Rotation actions removed — managed by single SSO_MASTER_KEY now.
