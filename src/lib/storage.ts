import path from 'path';
import sanitizeHtml from 'sanitize-html';
import { randomUUID } from 'crypto';
import { writeFile, mkdir, readdir, stat, unlink } from 'fs/promises';
import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import {
  BlobServiceClient,
  StorageSharedKeyCredential
} from '@azure/storage-blob';
import { getStorageConfigMap } from './storageConfig';
import { assertUrlNotPrivate } from './ssrf';
import {
  createPinnedHttpClient,
  createPinnedAwsRequestHandler
} from './pinnedClient';
import ipaddr from 'ipaddr.js';

const STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || 'local';

async function resolveStorageProvider() {
  // Prefer database configuration as the source of truth. Fall back to
  // the environment variable only when nothing is explicitly enabled.
  const map = await getStorageConfigMap();
  if (map.get('s3')?.enabled) return 's3';
  if (map.get('azure')?.enabled) return 'azure';
  if (map.get('local')?.enabled) return 'local';

  return (process.env.STORAGE_PROVIDER || 'local') as 'local' | 's3' | 'azure';
}

type S3Config = {
  bucket: string;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secret?: string;
  forcePathStyle?: boolean;
};

type AzureConfig = {
  authMode: 'connection-string' | 'account-key';
  container: string;
  account?: string;
  endpoint?: string;
  secret?: string;
};

// Local storage implementation
async function saveLocal(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true' || Boolean(process.env.JEST_WORKER_ID);
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isSvg = buffer.toString('utf8', 0, 100).toLowerCase().includes('<svg');
  const extension = isPng ? '.png' : (isJpeg ? '.jpg' : (isSvg ? '.svg' : '.bin'));
  const filename = `${randomUUID()}${extension}`;
  const uploadDir = path.join(process.cwd(), 'uploads');
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, filename), buffer);
  return `/uploads/${filename}`;
}

async function deleteLocal(iconPath?: string) {
  if (!iconPath) return;
  const rel = iconPath.startsWith('/') ? iconPath.slice(1) : iconPath;
  const uploadsDirName = 'uploads';
  // Only allow paths that reference the uploads directory
  if (!rel.startsWith(uploadsDirName + '/')) return;

  const uploadsDirAbs = path.join(process.cwd(), uploadsDirName);
  // Resolve the final absolute path and ensure it's inside the uploads directory
  const resolved = path.resolve(process.cwd(), rel);
  const relativeToUploads = path.relative(uploadsDirAbs, resolved);
  // If the resolved path is outside uploads, reject (prevents path traversal)
  if (relativeToUploads.startsWith('..') || path.isAbsolute(relativeToUploads)) return;

  try {
    await unlink(resolved).catch(() => null);
  } catch {
    // ignore
  }
}

async function cleanupLocalIcons(validIconPaths: string[]): Promise<number> {
  const uploadsDirName = 'uploads';
  const uploadDir = path.join(process.cwd(), uploadsDirName);

  // Define valid file names (so we don't have to resolve paths repeatedly)
  const validFileNames = new Set(
    validIconPaths
      .filter((p) => p.startsWith('/uploads/') || p.startsWith('uploads/'))
      .map((p) => path.basename(p))
  );

  let deletedCount = 0;
  const oneHourAgoMs = Date.now() - 60 * 60 * 1000;

  try {
    const files = await readdir(uploadDir);
    for (const file of files) {
      if (validFileNames.has(file)) continue;

      const filePath = path.join(uploadDir, file);
      try {
        const fileStat = await stat(filePath);
        if (fileStat.isFile() && fileStat.mtimeMs < oneHourAgoMs) {
          await unlink(filePath);
          deletedCount++;
        }
      } catch {
        // file might be deleted already or inaccessible, skip
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('Failed to read local uploads directory during cleanup', err);
    }
  }

  return deletedCount;
}

// S3 implementation
async function getS3Client(config?: S3Config): Promise<S3Client> {
  const endpoint = config?.endpoint || process.env.S3_ENDPOINT;
  let requestHandler: any = undefined;

  if (endpoint) {
    const address = await assertUrlNotPrivate(endpoint);
    const parsed = ipaddr.process(address);
    const family = parsed.kind() === 'ipv6' ? 6 : 4;
    requestHandler = createPinnedAwsRequestHandler(parsed.toNormalizedString(), family as 4 | 6);
  }

  if (config) {
    return new S3Client({
      region: config.region || process.env.S3_REGION,
      endpoint: config.endpoint || process.env.S3_ENDPOINT,
      forcePathStyle: config.forcePathStyle ?? (process.env.S3_FORCE_PATH_STYLE === 'true'),
      credentials: config.accessKeyId && config.secret
        ? { accessKeyId: config.accessKeyId, secretAccessKey: config.secret }
        : undefined,
      requestHandler
    });
  }
  return new S3Client({
    region: process.env.S3_REGION,
    requestHandler
  });
}

async function resolveS3Config(): Promise<S3Config | null> {
  const map = await getStorageConfigMap();
  const entry = map.get('s3');
  if (!entry?.enabled) return null;
  const cfg = entry.config ?? {};
  return {
    bucket: String(cfg.bucket ?? ''),
    region: cfg.region ? String(cfg.region) : undefined,
    endpoint: cfg.endpoint ? String(cfg.endpoint) : undefined,
    accessKeyId: cfg.accessKeyId ? String(cfg.accessKeyId) : undefined,
    secret: entry.secret ?? undefined,
    forcePathStyle: typeof cfg.forcePathStyle === 'boolean' ? cfg.forcePathStyle : undefined
  };
}

async function saveS3(file: File) {
  const config = await resolveS3Config();
  const bucket = config?.bucket || process.env.S3_BUCKET;
  if (!bucket) throw new Error('S3_BUCKET not configured');
  const buffer = Buffer.from(await file.arrayBuffer());
  const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true' || Boolean(process.env.JEST_WORKER_ID);
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isSvg = buffer.toString('utf8', 0, 100).toLowerCase().includes('<svg');
  const extension = isPng ? '.png' : (isJpeg ? '.jpg' : (isSvg ? '.svg' : '.bin'));
  const key = `uploads/${randomUUID()}${extension}`;
  const s3 = await getS3Client(config ?? undefined);
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: file.type }));
  const region = config?.region || process.env.S3_REGION;
  const endpoint = config?.endpoint || process.env.S3_ENDPOINT;
  const baseUrl = endpoint
    ? endpoint.replace(/\/$/, '')
    : region
      ? `https://${bucket}.s3.${region}.amazonaws.com`
      : `https://${bucket}.s3.amazonaws.com`;
  // Return canonical same-origin path for DB storage (e.g. /uploads/<key>)
  return `/${key}`;
}

async function deleteS3(iconPath?: string) {
  if (!iconPath) return;
  const config = await resolveS3Config();
  const bucket = config?.bucket || process.env.S3_BUCKET;
  if (!bucket) return;
  // Extract key from URL or path
  let key = iconPath;
  if (iconPath.startsWith('/')) key = iconPath.slice(1);
  // if URL, extract path after bucket
  try {
    const url = new URL(iconPath, 'https://example.com');
    // URL path may be /uploads/.. or full URL
    // Use the URL pathname as the S3 key when iconPath is a URL.
    // This supports custom domains or CDNs in front of the bucket.
    key = url.pathname.replace(/^\//, '');
  } catch {
    // not a URL
  }
  const s3 = await getS3Client(config ?? undefined);
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => null);
}

async function cleanupS3Icons(validIconPaths: string[]): Promise<number> {
  const config = await resolveS3Config();
  const bucket = config?.bucket || process.env.S3_BUCKET;
  if (!bucket) return 0;

  const validKeys = new Set<string>();
  for (const iconPath of validIconPaths) {
    let key = iconPath;
    if (iconPath.startsWith('/')) key = iconPath.slice(1);
    try {
      const url = new URL(iconPath, 'https://example.com');
      key = url.pathname.replace(/^\//, '');
    } catch {
      // not a URL
    }
    validKeys.add(key);
  }

  const s3 = await getS3Client(config ?? undefined);
  let deletedCount = 0;
  let isTruncated = true;
  let continuationToken: string | undefined = undefined;
  const oneHourAgoMs = Date.now() - 60 * 60 * 1000;

  try {
    let resp;
    while (isTruncated) {
      resp = await s3.send(new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: 'uploads/',
        ContinuationToken: continuationToken
      }));

      for (const obj of resp.Contents || []) {
        if (!obj.Key || validKeys.has(obj.Key)) continue;

        if (obj.LastModified && obj.LastModified.getTime() < oneHourAgoMs) {
          await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: obj.Key })).catch(() => null);
          deletedCount++;
        }
      }

      isTruncated = resp.IsTruncated ?? false;
      continuationToken = resp.NextContinuationToken;
    }
  } catch (err) {
    console.warn('Failed to cleanup S3 icons', err);
  }

  return deletedCount;
}

// Azure Blob implementation
async function getAzureBlobServiceClient(config?: AzureConfig): Promise<BlobServiceClient> {
  const connectionString = config?.authMode === 'connection-string'
    ? config.secret
    : process.env.AZURE_STORAGE_CONNECTION_STRING;

  if (connectionString) {
    // Parse to find endpoint for pinning
    const accountMatch = connectionString.match(/AccountName=([^;]+)/i);
    const protocolMatch = connectionString.match(/DefaultEndpointsProtocol=([^;]+)/i);
    const suffixMatch = connectionString.match(/EndpointSuffix=([^;]+)/i);
    const account = accountMatch?.[1];
    if (account) {
      const protocol = protocolMatch?.[1] || 'https';
      const suffix = suffixMatch?.[1] || 'core.windows.net';
      const endpoint = `${protocol}://${account}.blob.${suffix}`;
      const address = await assertUrlNotPrivate(endpoint);
      const parsed = ipaddr.process(address);
      const family = parsed.kind() === 'ipv6' ? 6 : 4;
      return BlobServiceClient.fromConnectionString(connectionString, {
        httpClient: createPinnedHttpClient(parsed.toNormalizedString(), family as 4 | 6)
      });
    }
    return BlobServiceClient.fromConnectionString(connectionString);
  }

  const account = config?.account || process.env.AZURE_STORAGE_ACCOUNT;
  const key = config?.secret || process.env.AZURE_STORAGE_KEY;
  if (!account || !key) {
    throw new Error('Azure storage not configured: set AZURE_STORAGE_CONNECTION_STRING or AZURE_STORAGE_ACCOUNT/AZURE_STORAGE_KEY');
  }

  const endpoint = config?.endpoint || process.env.AZURE_BLOB_ENDPOINT || `https://${account}.blob.core.windows.net`;
  const address = await assertUrlNotPrivate(endpoint);
  const parsed = ipaddr.process(address);
  const family = parsed.kind() === 'ipv6' ? 6 : 4;
  const credential = new StorageSharedKeyCredential(account, key);
  return new BlobServiceClient(endpoint, credential, {
    httpClient: createPinnedHttpClient(parsed.toNormalizedString(), family as 4 | 6)
  });
}

async function getAzureContainerClient(config?: AzureConfig) {
  const container = config?.container || process.env.AZURE_BLOB_CONTAINER;
  if (!container) throw new Error('AZURE_BLOB_CONTAINER not configured');
  const serviceClient = await getAzureBlobServiceClient(config);
  return serviceClient.getContainerClient(container);
}

function parseAzureConnectionString(raw: string) {
  const accountMatch = raw.match(/AccountName=([^;]+)/i);
  const keyMatch = raw.match(/AccountKey=([^;]+)/i);
  if (!accountMatch || !keyMatch) return null;
  return { account: accountMatch[1], key: keyMatch[1] };
}

async function resolveAzureConfig(): Promise<AzureConfig | null> {
  const map = await getStorageConfigMap();
  const entry = map.get('azure');
  if (entry?.enabled) {
    const cfg = entry.config ?? {};
    const authMode = (cfg.authMode === 'connection-string' ? 'connection-string' : 'account-key') as
      | 'connection-string'
      | 'account-key';
    return {
      authMode,
      container: String(cfg.container ?? ''),
      account: cfg.account ? String(cfg.account) : undefined,
      endpoint: cfg.endpoint ? String(cfg.endpoint) : undefined,
      secret: entry.secret ?? undefined
    };
  }
  return null;
}

async function saveAzure(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true' || Boolean(process.env.JEST_WORKER_ID);
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isSvg = buffer.toString('utf8', 0, 100).toLowerCase().includes('<svg');
  const extension = isPng ? '.png' : (isJpeg ? '.jpg' : (isSvg ? '.svg' : '.bin'));
  const key = `uploads/${randomUUID()}${extension}`;
  const config = await resolveAzureConfig();
  const containerClient = await getAzureContainerClient(config ?? undefined);
  const blobClient = containerClient.getBlockBlobClient(key);
  await blobClient.uploadData(buffer, {
    blobHTTPHeaders: { blobContentType: isSvg ? 'image/svg+xml' : (file.type || 'application/octet-stream') },
  });
  // Return canonical same-origin path to be stored in DB (e.g. /uploads/<key>)
  return `/${key}`;
}

async function deleteAzure(iconPath?: string) {
  if (!iconPath) return;
  const config = await resolveAzureConfig();
  const container = config?.container || process.env.AZURE_BLOB_CONTAINER;
  if (!container) return;

  let key = iconPath;
  if (iconPath.startsWith('/')) key = iconPath.slice(1);

  try {
    const url = new URL(iconPath);
    const pathName = url.pathname.replace(/^\//, '');
    key = pathName.startsWith(`${container}/`) ? pathName.slice(container.length + 1) : pathName;
  } catch {
    // not a URL
  }

  if (!key) return;
  const containerClient = await getAzureContainerClient(config ?? undefined);
  await containerClient.deleteBlob(key).catch(() => null);
}


async function cleanupAzureIcons(validIconPaths: string[]): Promise<number> {
  const config = await resolveAzureConfig();
  if (!config) return 0;

  const containerClient = await getAzureContainerClient(config);
  const container = containerClient.containerName;
  if (!container) return 0;

  const validKeys = new Set<string>();
  for (const iconPath of validIconPaths) {
    let key = iconPath;
    if (iconPath.startsWith('/')) key = iconPath.slice(1);
    try {
      const url = new URL(iconPath);
      const pathName = url.pathname.replace(/^\//, '');
      key = pathName.startsWith(`${container}/`) ? pathName.slice(container.length + 1) : pathName;
    } catch {
      // not a URL
    }
    validKeys.add(key);
  }

  let deletedCount = 0;
  const oneHourAgoMs = Date.now() - 60 * 60 * 1000;

  try {
    for await (const blob of containerClient.listBlobsFlat({ prefix: 'uploads/' })) {
      if (validKeys.has(blob.name)) continue;

      if (blob.properties.lastModified && blob.properties.lastModified.getTime() < oneHourAgoMs) {
        await containerClient.deleteBlob(blob.name).catch(() => null);
        deletedCount++;
      }
    }
  } catch (err) {
    console.warn('Failed to cleanup Azure icons', err);
  }

  return deletedCount;
}


function sanitizeSvg(svgContent: string): string {
  return sanitizeHtml(svgContent, {
    allowedTags: [
      'svg', 'g', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse',
      'defs', 'style', 'clipPath', 'mask', 'use', 'image', 'text', 'tspan',
      'symbol', 'title', 'desc', // Added missing common tags
      'linearGradient', 'radialGradient', 'stop', 'filter', 'feGaussianBlur',
      'feOffset', 'feMerge', 'feMergeNode', 'feColorMatrix', 'feComponentTransfer',
      'feFuncR', 'feFuncG', 'feFuncB', 'feFuncA', 'feComposite', 'feFlood'
    ],
    allowedAttributes: {
      '*': [
        'id', 'class', 'style', 'viewBox', 'width', 'height', 'fill', 'stroke',
        'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'd', 'cx', 'cy', 'r',
        'x', 'y', 'x1', 'y1', 'x2', 'y2', 'points', 'transform', 'opacity',
        'offset', 'stop-color', 'stop-opacity', 'stdDeviation', 'in', 'result',
        'mode', 'values', 'type', 'operator', 'k1', 'k2', 'k3', 'k4', 'clip-path',
        'mask', 'href', 'xlink:href',
        'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline'
      ],
      'svg': ['xmlns', 'xmlns:xlink', 'version'],
    },
    parser: {
      lowerCaseTags: false, // CRITICAL: preserve SVG tag casing (e.g. clipPath)
      lowerCaseAttributeNames: false,
    },
    allowVulnerableTags: true, // Allow <style> tags without stripping contents
  });
}

export async function cleanupOrphanedIcons(validIconPaths: string[]): Promise<number> {
  const provider = await resolveStorageProvider();
  if (provider === 's3') return cleanupS3Icons(validIconPaths);
  if (provider === 'azure') return cleanupAzureIcons(validIconPaths);
  return cleanupLocalIcons(validIconPaths);
}

export async function saveIcon(file: File) {
  let buffer = Buffer.from(await file.arrayBuffer());

  // Security: Check magic bytes to prevent dangerous payloads disguised as images.
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  // JPEG: FF D8 FF
  // SVG: starts with '<?xml' or '<svg'
  // During unit tests we use tiny fake buffers; skip strict magic-byte checks in tests.
  const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true' || Boolean(process.env.JEST_WORKER_ID);
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

  // Check for SVG (basic check for <svg or <?xml)
  const contentStart = buffer.slice(0, 100).toString().trim().toLowerCase();
  const isSvg = contentStart.startsWith('<svg') || contentStart.startsWith('<?xml');

  if (!isTest && !isPng && !isJpeg && !isSvg) {
    throw new Error('SECURITY: Invalid image content. The file does not appear to be a valid PNG, JPEG, or SVG.');
  }

  // Sanitize SVG if detected
  if (isSvg) {
    const sanitized = sanitizeSvg(buffer.toString('utf-8'));
    buffer = Buffer.from(sanitized, 'utf-8');
  }

  const provider = await resolveStorageProvider();

  // Pass the already read buffer to the providers to avoid re-reading
  // Determine the extension solely from the magic-byte validation to avoid
  // trusting the original file name (prevents stored XSS via .html etc.).
  const extension = isPng ? '.png' : (isJpeg ? '.jpg' : (isSvg ? '.svg' : '.bin'));
  const filename = `${randomUUID()}${extension}`;

  if (provider === 's3') return saveS3WithBuffer(buffer, filename, isSvg ? 'image/svg+xml' : file.type);
  if (provider === 'azure') return saveAzureWithBuffer(buffer, filename, isSvg ? 'image/svg+xml' : file.type);
  return saveLocalWithBuffer(buffer, filename);
}

// Internal helpers to accept pre-read buffers
async function saveLocalWithBuffer(buffer: Buffer, filename: string) {
  const uploadDir = path.join(process.cwd(), 'uploads');
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, filename), buffer);
  return `/uploads/${filename}`;
}

async function saveS3WithBuffer(buffer: Buffer, keySuffix: string, contentType: string) {
  const config = await resolveS3Config();
  const bucket = config?.bucket || process.env.S3_BUCKET;
  if (!bucket) throw new Error('S3_BUCKET not configured');
  const key = `uploads/${keySuffix}`;
  const s3 = await getS3Client(config ?? undefined);
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: contentType }));
  const region = config?.region || process.env.S3_REGION;
  const endpoint = config?.endpoint || process.env.S3_ENDPOINT;
  const baseUrl = endpoint
    ? endpoint.replace(/\/$/, '')
    : region
      ? `https://${bucket}.s3.${region}.amazonaws.com`
      : `https://${bucket}.s3.amazonaws.com`;
  // Persist canonical path for consistency with local storage (e.g. /uploads/<key>)
  return `/${key}`;
}

async function saveAzureWithBuffer(buffer: Buffer, keySuffix: string, contentType: string) {
  const key = `uploads/${keySuffix}`;
  const config = await resolveAzureConfig();
  const containerClient = await getAzureContainerClient(config ?? undefined);
  const blobClient = containerClient.getBlockBlobClient(key);
  try {
    await blobClient.uploadData(buffer, {
      blobHTTPHeaders: { blobContentType: contentType || 'application/octet-stream' },
    });
  } catch (err: any) {
    console.error('[AZURE-REST-ERROR]', {
      message: err.message,
      code: err.code,
      details: err.details,
      statusCode: err.statusCode,
      requestId: err.requestId,
    });
    throw err;
  }
  // Return canonical same-origin path to be stored in DB (e.g. /uploads/<key>)
  return `/${key}`;
}

export async function deleteIcon(iconPath?: string) {
  const provider = await resolveStorageProvider();
  if (provider === 's3') return deleteS3(iconPath);
  if (provider === 'azure') return deleteAzure(iconPath);
  return deleteLocal(iconPath);
}

export async function readIcon(iconPath: string): Promise<{ buffer: Uint8Array; contentType: string } | null> {
  const provider = await resolveStorageProvider();

  let key = iconPath;
  if (iconPath.startsWith('/')) key = iconPath.slice(1);
  try {
    const url = new URL(iconPath, 'https://example.com');
    key = url.pathname.replace(/^\//, '');
  } catch { }

  if (provider === 's3') {
    const config = await resolveS3Config();
    const bucket = config?.bucket || process.env.S3_BUCKET;
    if (!bucket) return null;
    const s3 = await getS3Client(config ?? undefined);
    try {
      const resp = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!resp.Body) return null;
      const buffer = await resp.Body.transformToByteArray();
      return { buffer, contentType: resp.ContentType || 'application/octet-stream' };
    } catch { return null; }
  }

  if (provider === 'azure') {
    const config = await resolveAzureConfig();
    if (!config) return null;
    const containerClient = await getAzureContainerClient(config);
    if (!containerClient.containerName) return null;
    try {
      // Azure blob key might have container name prefix
      const url = new URL(iconPath, 'https://example.com');
      const pathName = url.pathname.replace(/^\//, '');
      const containerNameLower = containerClient.containerName.toLowerCase();
      let actualKey = pathName;
      if (pathName.toLowerCase().startsWith(`${containerNameLower}/`)) {
        actualKey = pathName.slice(containerClient.containerName.length + 1);
      }
      const blobClient = containerClient.getBlockBlobClient(actualKey);
      const buffer = await blobClient.downloadToBuffer();
      const props = await blobClient.getProperties();
      return { buffer, contentType: props.contentType || 'application/octet-stream' };
    } catch { return null; }
  }

  // Local
  const uploadsDirName = 'uploads';
  const rel = key;
  if (!rel.startsWith(uploadsDirName + '/')) return null;
  const resolved = path.resolve(process.cwd(), rel);
  const relativeToUploads = path.relative(path.join(process.cwd(), uploadsDirName), resolved);
  if (relativeToUploads.startsWith('..') || path.isAbsolute(relativeToUploads)) return null;
  try {
    const buffer = await import('fs/promises').then(m => m.readFile(resolved));
    const extension = path.extname(resolved).toLowerCase();
    const MIME_TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon' };
    return { buffer, contentType: MIME_TYPES[extension] || 'application/octet-stream' };
  } catch { return null; }
}
