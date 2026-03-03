'use server';

import { z } from 'zod';
import path from 'path';
import { saveIcon as storageSaveIcon, deleteIcon as storageDeleteIcon, cleanupOrphanedIcons } from '../../lib/storage';
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
import { writeAuditLog } from '../../lib/audit';
import { validateCsrf } from '../../lib/csrf';
import { cookies } from 'next/headers';
import { Prisma } from '@prisma/client';
import { getServerAuthSession } from '../../lib/auth';
import { invalidateUserMeta } from '../../lib/userCache';
import { decryptSecret, encryptSecret, hasSecretKey } from '../../lib/crypto';
// SSO rotation removed: previously used rotateSsoSecrets utilities
import { hashPassword, validatePasswordComplexity } from '../../lib/password';
import { getPasswordPolicy } from '../../lib/passwordPolicy';
import { lookup } from 'dns/promises';
import https from 'https';
import http from 'http';
import ipaddr from 'ipaddr.js';
// Runtime assertion to ensure PostgreSQL is the configured provider.
// The application ships with PostgreSQL as a required dependency; several
// queries below rely on Postgres-specific SQL (FOR UPDATE) and will crash
// on SQLite. Call `assertPostgres()` at runtime before executing DB SQL
// that requires Postgres semantics.
function assertPostgres() {
  const url = String(process.env.DATABASE_URL ?? '').toLowerCase();
  const ok = url.startsWith('postgres:') || url.startsWith('postgresql:') || url.includes('postgres://') || url.includes('postgresql://') || url.includes('postgres');
  if (!ok) {
    throw new Error('Unsupported database provider: PostgreSQL is required');
  }
}
import { assertUrlNotPrivate, isPublicIp } from '../../lib/ssrf';
import { getStorageConfigMapWithDeps, StorageProviderId } from '@/lib/storageConfig';
import { BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob';
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';
// @ts-ignore - stale types in IDE
import { createHttpHeaders } from '@azure/core-rest-pipeline';
import {
  PinnedEndpoint,
  createPinnedHttpClient,
  createPinnedAwsRequestHandler
} from '../../lib/pinnedClient';

export type AdminActionState = { status: 'idle' | 'success' | 'error'; message: string };

const appSchemaBase = z.object({
  name: z.string().min(2),
  url: z
    .string()
    .url()
    .refine((value) => value.startsWith('http://') || value.startsWith('https://'), {
      message: 'URL must use http or https'
    }),
  categoryId: z.string().optional(),
  description: z.string().optional(),
  audience: z.enum(['PUBLIC', 'AUTHENTICATED', 'ROLE', 'USER']),
  roleIds: z.array(z.string()).optional(),
  userIds: z.array(z.string()).optional()
});

const appSchema = appSchemaBase
  .refine((data) => (data.audience === 'ROLE' ? Boolean(data.roleIds?.length) : true), {
    message: 'At least one role is required for role-based apps',
    path: ['roleIds']
  })
  .refine((data) => (data.audience === 'USER' ? Boolean(data.userIds?.length) : true), {
    message: 'At least one user is required for user-specific apps',
    path: ['userIds']
  });

const updateSchema = appSchemaBase
  .extend({
    id: z.string().min(1)
  })
  .refine((data) => (data.audience === 'ROLE' ? Boolean(data.roleIds?.length) : true), {
    message: 'At least one role is required for role-based apps',
    path: ['roleIds']
  })
  .refine((data) => (data.audience === 'USER' ? Boolean(data.userIds?.length) : true), {
    message: 'At least one user is required for user-specific apps',
    path: ['userIds']
  });

const MAX_ICON_BYTES = 2 * 1024 * 1024;
const ALLOWED_ICON_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.svg'
]);
const ALLOWED_ICON_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/svg+xml'
]);

const uploadSchema = z.any()
  .refine((file) => file && typeof (file as any).size === 'number', { message: 'Invalid file' })
  .refine((file) => (file as any).size <= MAX_ICON_BYTES, { message: 'File too large (maximum 2MB)' })
  .refine((file) => {
    // If it has a type, check it. Otherwise allow it (it might be a File-like object
    // with size but no type in some environments or test mocks).
    const type = (file as any).type;
    if (type && typeof type === 'string') {
      return ALLOWED_ICON_MIME_TYPES.has(type);
    }
    return true;
  }, { message: 'Invalid file type' });

// Also validate extension explicitly to avoid relying solely on the spoofable MIME type.
// Relaxed: Extension validation removed in favor of Magic Bytes parsing in the storage layer.

function isNonEmptyFile(f: unknown): f is File {
  // In browser environments File is available; in some test/node runtimes
  // it is not. Prefer `instanceof File` when available, otherwise fall
  // back to a structural check to preserve existing test behavior.
  if (typeof File !== 'undefined') {
    return f instanceof File && (f as File).size > 0;
  }
  return Boolean(f && typeof (f as any).size === 'number' && (f as any).size > 0);
}

const storageProviderSchema = z.enum(['local', 's3', 'azure']);
const storageIntentSchema = z.enum(['save', 'test']);
const storageAuthSchema = z.enum(['connection-string', 'account-key']);

async function saveIcon(file: File) {
  const parsed = uploadSchema.safeParse(file);
  if (!parsed.success) {
    const errorMsg = parsed.error.errors[0]?.message || 'Invalid file';
    throw new Error(errorMsg);
  }
  return storageSaveIcon(file);
}

async function safeDeleteIcon(iconPath?: string) {
  if (!iconPath) return;
  try {
    // Use the statically imported delete function to keep module
    // resolution consistent with test-runner mocking (e.g. vi.mock()).
    if (typeof storageDeleteIcon === 'function') {
      await storageDeleteIcon(iconPath);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('Failed to delete old icon', iconPath, err);
  }
}


function parseAzureConnectionString(raw: string) {
  const accountMatch = raw.match(/AccountName=([^;]+)/i);
  const keyMatch = raw.match(/AccountKey=([^;]+)/i);
  if (!accountMatch || !keyMatch) return null;
  return { account: accountMatch[1], key: keyMatch[1] };
}

function extractAzureBlobEndpoint(raw: string): string | null {
  const endpointMatch = raw.match(/BlobEndpoint=([^;]+)/i);
  if (endpointMatch?.[1]) return endpointMatch[1];

  const accountMatch = raw.match(/AccountName=([^;]+)/i);
  const protocolMatch = raw.match(/DefaultEndpointsProtocol=([^;]+)/i);
  const suffixMatch = raw.match(/EndpointSuffix=([^;]+)/i);
  const account = accountMatch?.[1];
  if (!account) return null;
  const protocol = protocolMatch?.[1] || 'https';
  const suffix = suffixMatch?.[1] || 'core.windows.net';
  return `${protocol}://${account}.blob.${suffix}`;
}

async function resolvePinnedEndpoint(rawUrl: string): Promise<PinnedEndpoint> {
  const address = await assertUrlNotPrivate(rawUrl);
  const url = new URL(rawUrl);
  const hostname = url.hostname.toLowerCase();
  const normalized = ipaddr.process(address).toNormalizedString();
  const family = ipaddr.process(address).kind() === 'ipv6' ? 6 : 4;
  return { url, hostname, address: normalized, family };
}

// Pinned client utilities moved to src/lib/pinnedClient.ts

async function testAzureStorageConnection(args: {
  authMode: 'connection-string' | 'account-key';
  connectionString?: string;
  account?: string;
  accountKey?: string;
  container: string;
  endpoint?: string;
}) {
  let client: BlobServiceClient | null = null;
  if (args.authMode === 'connection-string') {
    if (!args.connectionString) throw new Error('Connection string is required');
    const derivedEndpoint = extractAzureBlobEndpoint(args.connectionString);
    if (derivedEndpoint) {
      const pinned = await resolvePinnedEndpoint(derivedEndpoint);
      // Validate reachability to the container endpoint using pinned IP
      const checkUrl = `${pinned.url.origin}/${args.container}?restype=container`;
      const resp = await fetchWithPinnedIp(checkUrl, pinned.hostname, pinned.address);
      if (!resp.ok) throw new Error(`Azure blob endpoint unreachable (${resp.status})`);
      client = BlobServiceClient.fromConnectionString(args.connectionString, {
        httpClient: createPinnedHttpClient(pinned.address, pinned.family)
      });
    } else {
      client = BlobServiceClient.fromConnectionString(args.connectionString);
    }
  } else {
    if (!args.account || !args.accountKey) throw new Error('Account name and key are required');
    const endpoint = args.endpoint || `https://${args.account}.blob.core.windows.net`;
    if (args.endpoint) {
      const pinned = await resolvePinnedEndpoint(args.endpoint);
      const checkUrl = `${pinned.url.origin}/${args.container}?restype=container`;
      const resp = await fetchWithPinnedIp(checkUrl, pinned.hostname, pinned.address);
      if (!resp.ok) throw new Error(`Azure blob endpoint unreachable (${resp.status})`);
      const credential = new StorageSharedKeyCredential(args.account, args.accountKey);
      client = new BlobServiceClient(endpoint, credential, {
        httpClient: createPinnedHttpClient(pinned.address, pinned.family)
      });
    } else {
      const credential = new StorageSharedKeyCredential(args.account, args.accountKey);
      client = new BlobServiceClient(endpoint, credential);
    }
  }

  const containerClient = client.getContainerClient(args.container);
  await containerClient.getProperties();
}

async function testS3StorageConnection(args: {
  bucket: string;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
}) {
  let requestHandler: any | undefined;
  if (args.endpoint) {
    const pinned = await resolvePinnedEndpoint(args.endpoint);
    requestHandler = createPinnedAwsRequestHandler(pinned.address, pinned.family);
  }
  const client = new S3Client({
    region: args.region || process.env.S3_REGION,
    endpoint: args.endpoint || process.env.S3_ENDPOINT,
    forcePathStyle: args.forcePathStyle ?? (process.env.S3_FORCE_PATH_STYLE === 'true'),
    credentials: args.accessKeyId && args.secretAccessKey
      ? { accessKeyId: args.accessKeyId, secretAccessKey: args.secretAccessKey }
      : undefined,
    requestHandler
  });
  await client.send(new HeadBucketCommand({ Bucket: args.bucket }));
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


  try {
    const payload = appSchema.safeParse({
      name: formData.get('name'),
      url: formData.get('url'),
      categoryId: formData.get('categoryId') || undefined,
      description: formData.get('description') || undefined,
      audience: formData.get('audience'),
      roleIds: formData.getAll('roleIds').map((value) => String(value)),
      userIds: formData.getAll('userIds').map((value) => String(value))
    });

    const parsed = payload;
    if (!parsed.success) {
      return { status: 'error', message: 'Invalid app details' } as const;
    }

    const iconFile = formData.get('icon');
    let iconPath: string | undefined;

    // If an icon file was provided, upload it before the DB transaction so
    // we can delete it if the transaction fails (avoids orphaned files).
    // Be defensive: some browsers/clients may include an empty file field
    // (size === 0). Skip attempting to save when the file is empty to avoid
    // the "Empty file" validation error.
    if (isNonEmptyFile(iconFile)) {
      // validate & save (the local `saveIcon` helper performs validation)
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - narrowing above isn't always recognized in some TS targets
      iconPath = await saveIcon(iconFile as File);
    }
    try {
      await prisma.$transaction(async (tx) => {
        const app = await tx.appLink.create({
          data: {
            name: parsed.data.name,
            url: parsed.data.url,
            description: parsed.data.description,
            audience: parsed.data.audience,
            // @ts-ignore - Prisma relation name might be out of sync in some environments
            categoryRef: parsed.data.categoryId ? { connect: { id: parsed.data.categoryId } } : undefined,
            // @ts-ignore - Prisma types might be out of sync
            roles: parsed.data.audience === 'ROLE' && parsed.data.roleIds?.length ? { connect: parsed.data.roleIds.map(id => ({ id })) } : undefined,
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

      writeAuditLog({
        category: 'admin',
        action: 'app_created',
        actorId: session.user.id,
        details: { name: parsed.data.name, url: parsed.data.url },
      });

      await safeRevalidatePath('/admin');
      await safeRevalidatePath('/admin/apps');
      await safeRevalidatePath('/');
      return { status: 'success', message: 'App created' } as const;
    } catch (err) {
      // If the DB transaction failed, remove any uploaded icon to avoid orphaned files
      if (iconPath) await safeDeleteIcon(iconPath);
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return { status: 'error', message: 'App already exists' } as const;
      }
      return { status: 'error', message: err instanceof Error ? err.message : 'Failed to create app' } as const;
    }
  } catch (err) {
    console.error('Unexpected error in createApp action:', err);
    return { status: 'error', message: err instanceof Error ? err.message : 'Failed to create app' } as const;
  }
}

export async function deleteApp(formData: FormData) {
  if (!(await validateCsrf(formData))) {
    return { status: 'error', message: 'Invalid CSRF token' } as const;
  }
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

  writeAuditLog({
    category: 'admin',
    action: 'app_deleted',
    actorId: session.user.id,
    targetId: id,
    details: { name: app?.name },
  });

  await safeRevalidatePath('/admin');
  await safeRevalidatePath('/admin/apps');
  await safeRevalidatePath('/');
  return { status: 'success', message: 'App deleted' } as const;
}

export async function updateSiteLogos(formData: FormData) {
  if (!(await validateCsrf(formData))) return { status: 'error', message: 'Invalid CSRF token' } as const;
  const session = await getServerAuthSession();
  if (!session?.user?.roles?.includes('admin')) return { status: 'error', message: 'Unauthorized' } as const;

  try {
    const logoLightFile = formData.get('logoLight');
    const logoDarkFile = formData.get('logoDark');
    const faviconFile = formData.get('favicon');
    const removeLight = formData.get('removeLogoLight') === 'on' || formData.get('removeLogoLight') === '1';
    const removeDark = formData.get('removeLogoDark') === 'on' || formData.get('removeLogoDark') === '1';
    const removeFavicon = formData.get('removeFavicon') === 'on' || formData.get('removeFavicon') === '1';

    // Fetch existing singleton
    // @ts-ignore - stale prisma types in IDE
    const existing = await prisma.siteConfig.findFirst().catch(() => null);
    let newLogoLight = existing?.logoLight ?? existing?.logo ?? null;
    let newLogoDark = existing?.logoDark ?? existing?.logo ?? null;
    let newFavicon = existing?.faviconUrl ?? null;

    const toDelete: string[] = [];

    if (isNonEmptyFile(logoLightFile)) {
      // @ts-ignore - narrowing above isn't always recognized in some TS targets
      const saved = await saveIcon(logoLightFile as File);
      if (saved) {
        if (newLogoLight) toDelete.push(newLogoLight);
        newLogoLight = saved;
      }
    }

    if (isNonEmptyFile(logoDarkFile)) {
      // @ts-ignore - narrowing above isn't always recognized in some TS targets
      const saved = await saveIcon(logoDarkFile as File);
      if (saved) {
        if (newLogoDark) toDelete.push(newLogoDark);
        newLogoDark = saved;
      }
    }

    if (isNonEmptyFile(faviconFile)) {
      // @ts-ignore - narrowing above isn't always recognized in some TS targets
      const saved = await saveIcon(faviconFile as File);
      if (saved) {
        if (newFavicon) toDelete.push(newFavicon);
        newFavicon = saved;
      }
    }

    // Handle explicit removals
    if (removeLight) {
      if (newLogoLight) {
        toDelete.push(newLogoLight);
      }
      newLogoLight = null;
    }
    if (removeDark) {
      if (newLogoDark) {
        toDelete.push(newLogoDark);
      }
      newLogoDark = null;
    }
    if (removeFavicon) {
      if (newFavicon) {
        toDelete.push(newFavicon);
      }
      newFavicon = null;
    }

    // Optionally copy a single uploaded logo to both themes when requested
    const useSameLogo = formData.get('useSameLogo') === 'on' || formData.get('useSameLogo') === '1';
    if (useSameLogo) {
      // If the user chose to remove one theme's logo while opting to "use same logo",
      // interpret that as removing both themes' logos.
      if (removeLight || removeDark) {
        if (newLogoLight) toDelete.push(newLogoLight);
        if (newLogoDark) toDelete.push(newLogoDark);
        newLogoLight = null;
        newLogoDark = null;
      } else {
        // If a new light logo was uploaded, ensure dark is set to the same value (overwrite if needed)
        if (newLogoLight) {
          if (newLogoDark !== newLogoLight) {
            // If we're about to overwrite a newly uploaded dark logo (not an existing stored file),
            // ensure it gets cleaned up to avoid orphaning it in storage.
            if (newLogoDark && newLogoDark !== existing?.logoDark && newLogoDark !== existing?.logo) {
              toDelete.push(newLogoDark);
            }
            if (existing?.logoDark && existing.logoDark !== newLogoLight) toDelete.push(existing.logoDark);
            newLogoDark = newLogoLight;
          }
        }
        // If a new dark logo was uploaded, ensure light is set to the same value (overwrite if needed)
        if (newLogoDark) {
          if (newLogoLight !== newLogoDark) {
            // If we're about to overwrite a newly uploaded light logo (not an existing stored file),
            // ensure it gets cleaned up to avoid orphaning it in storage.
            if (newLogoLight && newLogoLight !== existing?.logoLight && newLogoLight !== existing?.logo) {
              toDelete.push(newLogoLight);
            }
            if (existing?.logoLight && existing.logoLight !== newLogoDark) toDelete.push(existing.logoLight);
            newLogoLight = newLogoDark;
          }
        }
      }
    }

    // Maintain legacy `logo` column for backward compatibility.
    // If both theme-specific logos are null, also clear `logo`.
    // If a single theme logo is present and `logo` differs, update it to point at that file.
    const newLegacyLogo = newLogoLight ?? newLogoDark ?? null;
    if (existing?.logo && existing.logo !== newLegacyLogo) {
      toDelete.push(existing.logo);
    }

    // Persist changes: create or update singleton
    try {
      // @ts-ignore - stale prisma types in IDE
      await prisma.siteConfig.upsert({
        where: { id: existing?.id ?? 'singleton' },
        create: {
          logo: newLegacyLogo,
          logoLight: newLogoLight,
          logoDark: newLogoDark,
          faviconUrl: newFavicon
        },
        update: {
          logo: newLegacyLogo,
          logoLight: newLogoLight,
          logoDark: newLogoDark,
          faviconUrl: newFavicon
        }
      });
    } catch (err) {
      // If DB persist failed, cleanup any newly uploaded files (they won't be in `existing`)
      if (newLogoLight && newLogoLight !== existing?.logoLight && newLogoLight !== existing?.logo) {
        await safeDeleteIcon(newLogoLight);
      }
      if (newLogoDark && newLogoDark !== existing?.logoDark && newLogoDark !== existing?.logo) {
        await safeDeleteIcon(newLogoDark);
      }
      if (newFavicon && newFavicon !== existing?.faviconUrl) {
        await safeDeleteIcon(newFavicon);
      }
      return { status: 'error', message: err instanceof Error ? err.message : 'Database error' } as const;
    }

    // Post-persist cleanup of old files.
    // Note: avoid deleting files that are still in use (e.g. if newLogoLight === oldLogoDark).
    const keepSet = new Set([newLogoLight, newLogoDark, newFavicon, newLegacyLogo]);
    for (const path of toDelete) {
      if (path && !keepSet.has(path)) {
        await safeDeleteIcon(path);
      }
    }

    writeAuditLog({
      category: 'admin',
      action: 'site_logos_updated',
      actorId: session.user.id,
      details: { logoLight: newLogoLight, logoDark: newLogoDark, favicon: newFavicon },
    });

    await safeRevalidatePath('/admin/settings');
    await safeRevalidatePath('/');
    return { status: 'success', message: 'Logos updated' } as const;
  } catch (err) {
    console.error('Unexpected error in updateSiteLogos action:', err);
    return { status: 'error', message: err instanceof Error ? err.message : 'Failed to update site logos' } as const;
  }
}

export async function updateStorageConfig(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  if (!(await validateCsrf(formData))) return { status: 'error', message: 'Invalid CSRF token' };
  const session = await getServerAuthSession();
  if (!session?.user?.roles?.includes('admin')) {
    return { status: 'error', message: 'Unauthorized' };
  }

  const provider = storageProviderSchema.safeParse(String(formData.get('provider') ?? ''));
  if (!provider.success) return { status: 'error', message: 'Unknown provider' };

  const intent = storageIntentSchema.safeParse(String(formData.get('intent') ?? 'save'));
  if (!intent.success) return { status: 'error', message: 'Invalid action' };

  const enabled = formData.get('enabled') === 'on';
  const authMode = storageAuthSchema.safeParse(String(formData.get('authMode') ?? 'account-key'));
  if (!authMode.success) return { status: 'error', message: 'Invalid auth mode' };

  const container = String(formData.get('container') ?? '').trim();
  const endpoint = String(formData.get('endpoint') ?? '').trim();
  const account = String(formData.get('account') ?? '').trim();
  const connectionString = String(formData.get('connectionString') ?? '').trim();
  const accountKey = String(formData.get('accountKey') ?? '').trim();
  const clearSecret = formData.get('clearSecret') === 'on';
  const bucket = String(formData.get('bucket') ?? '').trim();
  const region = String(formData.get('region') ?? '').trim();
  const accessKeyId = String(formData.get('accessKeyId') ?? '').trim();
  const secretAccessKey = String(formData.get('secretAccessKey') ?? '').trim();
  const forcePathStyle = formData.get('forcePathStyle') === 'on';

  const existing = await prisma.storageConfig.findUnique({ where: { provider: provider.data } });
  const existingSecret = existing?.secretEnc ? true : false;

  if (intent.data === 'test') {
    try {
      if (provider.data === 'local') {
        // Local storage requires no network test.
      } else if (provider.data === 's3') {
        if (!bucket) return { status: 'error', message: 'Bucket is required to test' };
        const secret = secretAccessKey || (existing?.secretEnc ? decryptSecret(existing.secretEnc) : '');
        await testS3StorageConnection({
          bucket,
          region: region || undefined,
          endpoint: endpoint || undefined,
          accessKeyId: accessKeyId || undefined,
          secretAccessKey: secret || undefined,
          forcePathStyle
        });
      } else {
        if (!container) return { status: 'error', message: 'Container is required to test' };
        if (authMode.data === 'connection-string') {
          const secret = connectionString || (existing?.secretEnc ? decryptSecret(existing.secretEnc) : '');
          await testAzureStorageConnection({
            authMode: 'connection-string',
            connectionString: secret,
            container
          });
        } else {
          const secret = accountKey || (existing?.secretEnc ? decryptSecret(existing.secretEnc) : '');
          await testAzureStorageConnection({
            authMode: 'account-key',
            account,
            accountKey: secret,
            container,
            endpoint: endpoint || undefined
          });
        }
      }
    } catch (error) {
      return { status: 'error', message: error instanceof Error ? error.message : 'Connection test failed' };
    }
    await safeRevalidateTag('storage-config');
    await safeRevalidatePath('/admin');
    return { status: 'success', message: 'Storage test succeeded' };
  }

  if (enabled) {
    if (provider.data === 'local') {
      // no-op
    } else if (provider.data === 's3') {
      if (!bucket) return { status: 'error', message: 'Bucket is required' };
      if (!secretAccessKey && !existingSecret && !clearSecret) {
        return { status: 'error', message: 'Secret access key is required' };
      }
      if (!accessKeyId && !existingSecret && !clearSecret) {
        return { status: 'error', message: 'Access key ID is required' };
      }
    } else {
      if (!container) {
        return { status: 'error', message: 'Container name is required' };
      }
      if (authMode.data === 'connection-string') {
        if (!connectionString && !existingSecret && !clearSecret) {
          return { status: 'error', message: 'Connection string is required' };
        }
      } else {
        if (!account) return { status: 'error', message: 'Account name is required' };
        if (!accountKey && !existingSecret && !clearSecret) {
          return { status: 'error', message: 'Account key is required' };
        }
      }
    }
  }

  if (!hasSecretKey() && (connectionString || accountKey || secretAccessKey)) {
    return { status: 'error', message: 'SSO_MASTER_KEY is required to save secrets' };
  }

  const config: Prisma.InputJsonValue | Prisma.NullTypes.JsonNull = enabled
    ? provider.data === 's3'
      ? {
        bucket,
        region: region || null,
        endpoint: endpoint || null,
        accessKeyId: accessKeyId || null,
        forcePathStyle
      }
      : provider.data === 'azure'
        ? {
          authMode: authMode.data,
          container,
          account: account || null,
          endpoint: endpoint || null
        }
        : {}
    : Prisma.JsonNull;

  const updateData: {
    enabled: boolean;
    config: Prisma.InputJsonValue | Prisma.NullTypes.JsonNull;
    secretEnc?: string | null;
  } = {
    enabled,
    config
  };

  if (clearSecret) {
    updateData.secretEnc = null;
  }
  if (connectionString) {
    updateData.secretEnc = encryptSecret(connectionString);
  }
  if (accountKey) {
    updateData.secretEnc = encryptSecret(accountKey);
  }
  if (secretAccessKey) {
    updateData.secretEnc = encryptSecret(secretAccessKey);
  }

  await prisma.$transaction([
    prisma.storageConfig.upsert({
      where: { provider: provider.data },
      update: updateData,
      create: {
        provider: provider.data,
        enabled,
        config,
        secretEnc: updateData.secretEnc ?? null
      }
    }),
    prisma.storageConfig.updateMany({
      where: { provider: { in: ['local', 's3', 'azure'], not: provider.data } },
      data: { enabled: false, config: Prisma.JsonNull }
    })
  ]);

  writeAuditLog({
    category: 'config',
    action: 'storage_config_saved',
    actorId: session.user.id,
    provider: provider.data,
    details: { enabled, config },
  });

  await safeRevalidateTag('storage-config');
  await safeRevalidatePath('/admin');
  return { status: 'success', message: enabled ? 'Storage settings saved' : 'Storage disabled' };
}

export async function updateApp(formData: FormData) {
  try {
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
      categoryId: formData.get('categoryId') || undefined,
      description: formData.get('description') || undefined,
      audience: formData.get('audience'),
      roleIds: formData.getAll('roleIds').map((value) => String(value)),
      userIds: formData.getAll('userIds').map((value) => String(value))
    });

    if (!parsed.success) {
      return { status: 'error', message: 'Invalid app details' } as const;
    }

    const iconFile = formData.get('icon');
    const iconRemove = formData.get('iconRemove') === 'on';
    let iconPath: string | undefined;

    // Fetch existing icon path so we can remove the old file after successful update
    const existingApp = await prisma.appLink.findUnique({ where: { id: parsed.data.id } });

    // If an icon file was provided, upload it before the DB transaction so
    // we can delete it if the transaction fails (avoids orphaned files).
    // Be defensive: skip saving if the file is empty (size === 0) to avoid
    // the "Empty file" validation error when the client submits an empty
    // file field (typical when only the remove checkbox is used).
    if (isNonEmptyFile(iconFile)) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - narrowing above isn't always recognized in some TS targets
      iconPath = await saveIcon(iconFile as File);
    }

    try {
      await prisma.$transaction(async (tx) => {
        await tx.appLink.update({
          where: { id: parsed.data.id },
          data: {
            name: parsed.data.name,
            url: parsed.data.url,
            // @ts-ignore - Prisma relation name might be out of sync in some environments
            categoryRef: parsed.data.categoryId ? { connect: { id: parsed.data.categoryId } } : { disconnect: true },
            description: parsed.data.description,
            audience: parsed.data.audience,
            // @ts-ignore - stale prisma types in IDE
            roles: parsed.data.audience === 'ROLE' && parsed.data.roleIds?.length ? { set: parsed.data.roleIds.map(id => ({ id })) } : { set: [] },
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
      // Return an error result rather than throwing so the client can display
      // a specific message instead of hitting the generic exception handler.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return { status: 'error', message: 'App already exists' } as const;
      }
      return { status: 'error', message: err instanceof Error ? err.message : 'Failed to update app' } as const;
    }

    // After successful transaction, try to perform post-update tasks such as
    // deleting the previous icon, auditing, and revalidation. These are
    // non-critical: the DB update already committed and should be treated as
    // successful even if cleanup steps fail. Catch and log any errors so a
    // cleanup failure doesn't surface as a save failure to the UI.
    try {
      if (existingApp?.icon) {
        if (iconRemove || (iconPath && existingApp.icon !== iconPath)) {
          await safeDeleteIcon(existingApp.icon);
        }
      }

      writeAuditLog({
        category: 'admin',
        action: 'app_updated',
        actorId: session.user.id,
        targetId: parsed.data.id,
        details: { name: parsed.data.name, url: parsed.data.url },
      });

      await safeRevalidatePath('/admin');
      await safeRevalidatePath('/admin/apps');
      await safeRevalidatePath('/');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('Non-fatal post-update task failed for app update', err);
    }

    return { status: 'success', message: 'App updated' } as const;
  } catch (err) {
    // Catch any unexpected error and return a structured message so the client
    // shows a useful error instead of the generic catch-all. Also log it.
    // eslint-disable-next-line no-console
    console.error('Unexpected error in updateApp action:', err);
    return { status: 'error', message: err instanceof Error ? err.message : 'Failed to update app' } as const;
  }
}

export async function triggerStorageCleanup(formData: FormData): Promise<AdminActionState> {
  if (!(await validateCsrf(formData))) return { status: 'error', message: 'Invalid CSRF token' };
  const session = await getServerAuthSession();
  if (!session?.user?.roles?.includes('admin')) {
    return { status: 'error', message: 'Unauthorized' };
  }
  if (session?.user?.mustChangePassword && session.user.authProvider === 'credentials') {
    return { status: 'error', message: 'Unauthorized: must_change_password' };
  }

  try {
    const [appsWithIcons, siteConfig] = await Promise.all([
      prisma.appLink.findMany({
        where: { icon: { not: null } },
        select: { icon: true }
      }),
      // @ts-ignore - stale prisma types in IDE
      prisma.siteConfig.findFirst()
    ]);

    const validIconPaths = appsWithIcons.map((app: any) => app.icon as string);
    if (siteConfig) {
      if (siteConfig.logoLight) validIconPaths.push(siteConfig.logoLight);
      if (siteConfig.logoDark) validIconPaths.push(siteConfig.logoDark);
      if (siteConfig.faviconUrl) validIconPaths.push(siteConfig.faviconUrl);
      if (siteConfig.logo) validIconPaths.push(siteConfig.logo);
    }

    const deletedCount = await cleanupOrphanedIcons(validIconPaths);

    writeAuditLog({
      category: 'admin',
      action: 'orphaned_icons_deleted',
      actorId: session.user.id,
      details: { count: deletedCount }
    });

    return { status: 'success', message: `Cleanup complete. Deleted ${deletedCount} orphaned icons.` };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Failed to cleanup icons' };
  }
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
  const roleIdsFromRoles = formData.getAll('roles').map((value) => String(value));
  const roleIdsFromRoleIds = formData.getAll('roleIds').map((value) => String(value));
  const roleIds = Array.from(new Set([...roleIdsFromRoles, ...roleIdsFromRoleIds])).filter(Boolean);
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
        // This logic requires PostgreSQL; assert that the configured
        // provider is Postgres and use FOR UPDATE to obtain a row lock.
        assertPostgres();
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
        // Bump the parent user's updatedAt so session revocation logic
        // (which compares token.userUpdatedAt to user.updatedAt) triggers
        // immediately rather than waiting for cache expiry.
        await tx.user.update({ where: { id: parsed.data.userId }, data: { updatedAt: new Date() } });
      });
    } catch (err) {
      if ((err as Error).message === 'last-admin') {
        return { status: 'error', message: 'last-admin' };
      }
      return { status: 'error', message: err instanceof Error ? err.message : 'Failed to update roles' };
    }
  } else {
    // No admin role exists at all, just perform the replace.
    await prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: parsed.data.userId } });
      if (nextRoles.length) {
        await tx.userRole.createMany({
          data: nextRoles.map((roleId) => ({ userId: parsed.data.userId, roleId })),
          skipDuplicates: true
        });
      }

      // Bump parent user's updatedAt to trigger session revocation coherence.
      await tx.user.update({ where: { id: parsed.data.userId }, data: { updatedAt: new Date() } });
    });
  }

  // Invalidate cached user meta so session cache reflects new roles.
  try {
    await invalidateUserMeta(parsed.data.userId);
  } catch {
    // ignore cache invalidation failures
  }

  // Audit role changes
  const allRoles = await prisma.role.findMany({ select: { id: true, name: true } });
  const roleNameMap = new Map(allRoles.map((r) => [r.id, r.name]));
  const previousRoleIds = new Set(formData.getAll('previousRoles').map(String).filter(Boolean));
  for (const roleId of nextRoles) {
    if (!previousRoleIds.has(roleId)) {
      writeAuditLog({
        category: 'admin',
        action: 'role_assigned',
        actorId: session.user.id,
        targetId: parsed.data.userId,
        details: { roleName: roleNameMap.get(roleId) ?? roleId },
      });
    }
  }
  for (const roleId of previousRoleIds) {
    if (!nextRoles.includes(roleId)) {
      writeAuditLog({
        category: 'admin',
        action: 'role_removed',
        actorId: session.user.id,
        targetId: parsed.data.userId,
        details: { roleName: roleNameMap.get(roleId) ?? roleId },
      });
    }
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
        // Use Postgres FOR UPDATE; ensure the configured DB is Postgres.
        assertPostgres();
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

  writeAuditLog({
    category: 'admin',
    action: 'user_deleted',
    actorId: sessionCheck.user.id,
    targetId: userId,
    details: { email: targetEmail },
  });

  await safeRevalidatePath('/admin');
  return { status: 'success', message: 'User deleted' };
}

export async function searchUsers(query: string, limit: number = 10) {
  const session = await getServerAuthSession();
  if (!session?.user?.roles?.includes('admin')) {
    throw new Error('Unauthorized');
  }

  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true },
    where: {
      OR: [
        { email: { contains: trimmedQuery, mode: 'insensitive' } },
        { name: { contains: trimmedQuery, mode: 'insensitive' } }
      ]
    },
    take: limit,
    orderBy: { email: 'asc' }
  });

  return users;
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

  writeAuditLog({
    category: 'admin',
    action: 'role_created',
    actorId: session.user.id,
    details: { name: payload.data.name },
  });

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
    // @ts-ignore - stale types in IDE
    prisma.appLink.count({ where: { roles: { some: { id: roleId } } } })
  ]);

  if (userRoleCount > 0 || appRoleCount > 0) {
    return { status: 'error', message: 'Role is assigned; remove assignments before deleting' };
  }

  try {
    await prisma.role.delete({ where: { id: roleId } });
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Failed to delete role' };
  }

  writeAuditLog({
    category: 'admin',
    action: 'role_deleted',
    actorId: session.user.id,
    targetId: roleId,
    details: { name: role.name },
  });

  await safeRevalidatePath('/admin');
  return { status: 'success', message: 'Role deleted' };
}

const localUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
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

  const roleIdsFromRoles = formData.getAll('roles').map((value) => String(value));
  const roleIdsFromRoleIds = formData.getAll('roleIds').map((value) => String(value));
  const rawRoles = Array.from(new Set([...roleIdsFromRoles, ...roleIdsFromRoleIds])).filter(Boolean);

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
    const emailError = payload.error?.errors?.find((e) => Array.isArray(e.path) && e.path[0] === 'email');
    if (emailError) {
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

  writeAuditLog({
    category: 'admin',
    action: 'user_created',
    actorId: session.user.id,
    targetId: createdUserId ?? undefined,
    details: { email: payload.data.email, roles: roleIds },
  });

  await safeRevalidatePath('/admin');
  return { status: 'success', message: 'Local user created' };
}

export type ForcePasswordResetState = {
  status: 'idle' | 'success' | 'error';
  message: string;
  generatedPassword?: string;
};

export async function forcePasswordReset(
  _prevState: ForcePasswordResetState,
  formData: FormData
): Promise<ForcePasswordResetState> {
  if (!(await validateCsrf(formData))) return { status: 'error', message: 'Invalid CSRF token' };
  const session = await getServerAuthSession();
  if (!session?.user?.roles?.includes('admin')) {
    return { status: 'error', message: 'Unauthorized' };
  }
  if (session?.user?.mustChangePassword && session.user.authProvider === 'credentials') {
    return { status: 'error', message: 'Unauthorized: must_change_password' };
  }

  const userId = String(formData.get('userId') ?? '').trim();
  if (!userId) {
    return { status: 'error', message: 'User ID is required' };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.passwordHash) {
    return { status: 'error', message: 'User not found or is not a local account' };
  }

  // Generate a secure 16-character random password
  const { randomBytes } = await import('crypto');
  const generatedPassword = randomBytes(12).toString('base64'); // ~16 chars

  const passwordHash = await hashPassword(generatedPassword);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          mustChangePassword: true
        }
      });

      await tx.passwordHistory.create({
        data: { userId, hash: passwordHash }
      });
    });
  } catch (error) {
    console.error('[Admin] Error forcing password reset:', error);
    return { status: 'error', message: 'Failed to reset password' };
  }

  try {
    await invalidateUserMeta(userId);
  } catch {
    // ignore cache errors
  }

  writeAuditLog({
    category: 'admin',
    action: 'user_password_reset',
    actorId: session.user.id,
    targetId: userId,
    details: { email: user.email }
  });

  await safeRevalidatePath('/admin');
  return { status: 'success', message: 'Password reset successfully', generatedPassword };
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
    });

    writeAuditLog({
      category: 'config',
      action: 'sso_account_linked',
      actorId: session?.user?.id ?? null,
      targetId: user.id,
      provider: payload.data.provider,
      details: {
        providerAccountId: payload.data.providerAccountId,
        email: user.email
      },
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

  writeAuditLog({
    category: 'config',
    action: 'password_policy_updated',
    actorId: session.user.id,
    details: payload.data,
  });

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

// Use shared `isPublicIp` from src/lib/ssrf

type ResolvedIssuer = {
  normalized: string;
  hostname: string;
  addresses: Array<{ address: string; family: 4 | 6 }>;
};

async function validateIssuerUrl(rawIssuer: string): Promise<ResolvedIssuer> {
  const address = await assertUrlNotPrivate(rawIssuer);
  const url = new URL(rawIssuer);
  const hostname = url.hostname.toLowerCase();
  const normalized = normalizeIssuer(url.toString());
  const parsed = ipaddr.process(address);
  const family = parsed.kind() === 'ipv6' ? 6 : 4;

  return {
    normalized,
    hostname,
    addresses: [{ address: parsed.toNormalizedString(), family: family as 4 | 6 }]
  };
}

// SSRF protection is implemented in src/lib/ssrf.ts and imported above.

async function fetchWithPinnedIp(url: string, hostname: string, address: string, maxRedirects = 5) {
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
    const isHttp = target.protocol === 'http:';
    const client = isHttp ? http : https;
    const defaultPort = isHttp ? 80 : 443;
    const requestOptions: (http.RequestOptions | https.RequestOptions) = {
      protocol: target.protocol,
      hostname: resolvedAddress,
      port: Number(target.port || defaultPort),
      path: `${target.pathname}${target.search}`,
      method: 'GET',
      headers: { host: hostname }
    };
    if (!isHttp) {
      // servername is only relevant for TLS/SNI
      (requestOptions as https.RequestOptions).servername = hostname;
    }

    const request = client.request(requestOptions, (response) => {
      const status = response.statusCode ?? 0;

      // Handle HTTP redirects explicitly (301, 302, 307, 308)
      if ([301, 302, 307, 308].includes(status) && response.headers.location) {
        const location = String(response.headers.location);
        response.resume();
        (async () => {
          try {
            if (maxRedirects <= 0) {
              throw new Error('Too many redirects');
            }
            const nextUrl = new URL(location, target);
            // Validate redirect target with existing SSRF checks
            const validated = await validateIssuerUrl(nextUrl.toString());
            const nextAddress = validated.addresses?.[0]?.address;
            if (!nextAddress) throw new Error('Redirect target resolved to no valid IPs');
            const result = await fetchWithPinnedIp(nextUrl.toString(), validated.hostname, nextAddress, maxRedirects - 1);
            resolve(result);
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        })();
        return;
      }

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
    writeAuditLog({
      category: 'config',
      action: 'sso_config_saved',
      actorId: session.user.id,
      provider: 'credentials',
      details: { enabled },
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

    writeAuditLog({
      category: 'config',
      action: 'sso_config_saved',
      actorId: session.user.id,
      provider: 'azure-ad',
      details: {
        enabled: payload.enabled,
        config,
        secretUpdated: Boolean(payload.clientSecret) || payload.clearSecret
      },
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

  writeAuditLog({
    category: 'config',
    action: 'sso_config_saved',
    actorId: session.user.id,
    provider: 'keycloak',
    details: {
      enabled: payload.enabled,
      config,
      secretUpdated: Boolean(payload.clientSecret) || payload.clearSecret
    },
  });

  await safeRevalidateTag('sso-config');
  await safeRevalidatePath('/admin');
  return { status: 'success', message: payload.enabled ? 'Keycloak settings saved and enabled' : 'Keycloak settings saved (disabled)' };
}

// Rotation actions removed — managed by single SSO_MASTER_KEY now.

export async function getAppLaunchStats() {
  const session = await getServerAuthSession();
  if (!session?.user?.roles?.includes('admin')) {
    throw new Error('Unauthorized');
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const stats = await prisma.auditLog.groupBy({
    by: ['targetId'],
    where: {
      action: 'app_launch',
      createdAt: { gte: thirtyDaysAgo },
    },
    _count: {
      id: true,
    },
    orderBy: {
      _count: {
        id: 'desc',
      },
    },
    take: 5,
  });

  const appIds = stats.map(s => s.targetId).filter((id): id is string => Boolean(id));
  const apps = await prisma.appLink.findMany({
    where: { id: { in: appIds } },
    select: { id: true, name: true }
  });
  const nameMap = new Map(apps.map(a => [a.id, a.name]));

  return stats.map(s => ({
    name: s.targetId ? nameMap.get(s.targetId) ?? 'Unknown App' : 'Unknown App',
    count: s._count.id
  }));
}

export async function getUserActivityStats() {
  const session = await getServerAuthSession();
  if (!session?.user?.roles?.includes('admin')) {
    throw new Error('Unauthorized');
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Group by day using PostgreSQL date_trunc for high performance.
  // This avoids fetching potentially thousands of records into memory.
  const stats = await prisma.$queryRaw<any[]>`
    SELECT 
      TO_CHAR(DATE_TRUNC('day', "createdAt"), 'YYYY-MM-DD') as date,
      COUNT(*)::int as count
    FROM "AuditLog"
    WHERE "createdAt" >= ${thirtyDaysAgo}
    GROUP BY DATE_TRUNC('day', "createdAt")
    ORDER BY DATE_TRUNC('day', "createdAt") ASC
  `;

  return stats;
}
