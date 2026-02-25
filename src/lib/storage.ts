import path from 'path';
import { randomUUID } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  BlobSASPermissions,
  generateBlobSASQueryParameters
} from '@azure/storage-blob';
import { getStorageConfigMap } from './storageConfig';

const STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || 'local';

async function resolveStorageProvider() {
  const envProvider = (process.env.STORAGE_PROVIDER || 'local') as 'local' | 's3' | 'azure';
  if (envProvider !== 'local') return envProvider;
  const map = await getStorageConfigMap();
  if (map.get('s3')?.enabled) return 's3';
  if (map.get('azure')?.enabled) return 'azure';
  if (map.get('local')?.enabled) return 'local';
  return envProvider;
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
  sasTtlMinutes?: number;
};

// Local storage implementation
async function saveLocal(file: File) {
  const extension = path.extname(file.name) || '.png';
  const filename = `${randomUUID()}${extension}`;
  const uploadDir = path.join(process.cwd(), 'uploads');
  await mkdir(uploadDir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
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
    await import('fs/promises').then((fs) => fs.unlink(resolved)).catch(() => null);
  } catch {
    // ignore
  }
}

// S3 implementation
// Module-level S3 client singleton. Keep instance in module scope so it
// persists across calls and reuses HTTP connections.
let s3ClientInstance: S3Client | null = null;
function getS3Client(config?: S3Config): S3Client {
  if (config) {
    return new S3Client({
      region: config.region || process.env.S3_REGION,
      endpoint: config.endpoint || process.env.S3_ENDPOINT,
      forcePathStyle: config.forcePathStyle ?? (process.env.S3_FORCE_PATH_STYLE === 'true'),
      credentials: config.accessKeyId && config.secret
        ? { accessKeyId: config.accessKeyId, secretAccessKey: config.secret }
        : undefined
    });
  }
  if (!s3ClientInstance) {
    const region = process.env.S3_REGION;
    s3ClientInstance = new S3Client({ region });
  }
  return s3ClientInstance;
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
  const extension = path.extname(file.name) || '.png';
  const key = `uploads/${randomUUID()}${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const s3 = getS3Client(config ?? undefined);
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: file.type }));
  const region = config?.region || process.env.S3_REGION;
  const endpoint = config?.endpoint || process.env.S3_ENDPOINT;
  const baseUrl = endpoint
    ? endpoint.replace(/\/$/, '')
    : region
      ? `https://${bucket}.s3.${region}.amazonaws.com`
      : `https://${bucket}.s3.amazonaws.com`;
  const url = `${baseUrl}/${key}`;
  return url;
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
  const s3 = getS3Client(config ?? undefined);
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => null);
}

// Azure Blob implementation
let azureClientInstance: BlobServiceClient | null = null;
function getAzureBlobServiceClient(config?: AzureConfig): BlobServiceClient {
  if (azureClientInstance) return azureClientInstance;

  const connectionString = config?.authMode === 'connection-string'
    ? config.secret
    : process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (connectionString) {
    azureClientInstance = BlobServiceClient.fromConnectionString(connectionString);
    return azureClientInstance;
  }

  const account = config?.account || process.env.AZURE_STORAGE_ACCOUNT;
  const key = config?.secret || process.env.AZURE_STORAGE_KEY;
  if (!account || !key) {
    throw new Error('Azure storage not configured: set AZURE_STORAGE_CONNECTION_STRING or AZURE_STORAGE_ACCOUNT/AZURE_STORAGE_KEY');
  }

  const endpoint = config?.endpoint || process.env.AZURE_BLOB_ENDPOINT || `https://${account}.blob.core.windows.net`;
  const credential = new StorageSharedKeyCredential(account, key);
  azureClientInstance = new BlobServiceClient(endpoint, credential);
  return azureClientInstance;
}

function getAzureContainerClient(config?: AzureConfig) {
  const container = config?.container || process.env.AZURE_BLOB_CONTAINER;
  if (!container) throw new Error('AZURE_BLOB_CONTAINER not configured');
  return getAzureBlobServiceClient(config).getContainerClient(container);
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
      secret: entry.secret ?? undefined,
      sasTtlMinutes: cfg.sasTtlMinutes ? Number(cfg.sasTtlMinutes) : undefined
    };
  }
  return null;
}

async function saveAzure(file: File) {
  const extension = path.extname(file.name) || '.png';
  const key = `uploads/${randomUUID()}${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const config = await resolveAzureConfig();
  const containerClient = getAzureContainerClient(config ?? undefined);
  const blobClient = containerClient.getBlockBlobClient(key);
  await blobClient.uploadData(buffer, {
    blobHTTPHeaders: { blobContentType: file.type || 'application/octet-stream' },
  });
  return blobClient.url;
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
  const containerClient = getAzureContainerClient(config ?? undefined);
  await containerClient.deleteBlob(key).catch(() => null);
}

export async function createAzureUploadSas(
  blobName: string,
  contentType?: string
): Promise<{ uploadUrl: string; blobUrl: string; expiresAt: string }> {
  const config = await resolveAzureConfig();
  const container = config?.container || process.env.AZURE_BLOB_CONTAINER;
  if (!container) {
    throw new Error('AZURE_BLOB_CONTAINER not configured');
  }

  const connectionString = config?.authMode === 'connection-string'
    ? config?.secret
    : process.env.AZURE_STORAGE_CONNECTION_STRING;
  const accountName = config?.account || process.env.AZURE_STORAGE_ACCOUNT;
  const key = config?.secret || process.env.AZURE_STORAGE_KEY;

  let credential: StorageSharedKeyCredential | null = null;
  if (connectionString) {
    const parsed = parseAzureConnectionString(connectionString);
    if (!parsed) throw new Error('Invalid AZURE_STORAGE_CONNECTION_STRING');
    credential = new StorageSharedKeyCredential(parsed.account, parsed.key);
  } else if (accountName && key) {
    credential = new StorageSharedKeyCredential(accountName, key);
  }

  if (!credential) {
    throw new Error('Azure storage credentials not configured');
  }

  const ttl = config?.sasTtlMinutes
    ? Math.max(1, config.sasTtlMinutes)
    : Number(process.env.AZURE_SAS_TTL_MINUTES ?? 10);
  const expiresOn = new Date(Date.now() + ttl * 60 * 1000);
  const permissions = BlobSASPermissions.parse('cw');
  const sas = generateBlobSASQueryParameters(
    {
      containerName: container,
      blobName,
      permissions,
      expiresOn,
      contentType
    },
    credential
  ).toString();

  const endpoint = config?.endpoint
    || (accountName ? `https://${accountName}.blob.core.windows.net` : undefined)
    || (() => {
      if (!connectionString) return undefined;
      const parsed = parseAzureConnectionString(connectionString);
      return parsed ? `https://${parsed.account}.blob.core.windows.net` : undefined;
    })();

  if (!endpoint) {
    throw new Error('Azure blob endpoint not configured');
  }

  const blobUrl = `${endpoint}/${container}/${blobName}`;
  return {
    uploadUrl: `${blobUrl}?${sas}`,
    blobUrl,
    expiresAt: expiresOn.toISOString()
  };
}

export async function saveIcon(file: File) {
  const provider = await resolveStorageProvider();
  if (provider === 's3') return saveS3(file);
  if (provider === 'azure') return saveAzure(file);
  return saveLocal(file);
}

export async function deleteIcon(iconPath?: string) {
  const provider = await resolveStorageProvider();
  if (provider === 's3') return deleteS3(iconPath);
  if (provider === 'azure') return deleteAzure(iconPath);
  return deleteLocal(iconPath);
}
