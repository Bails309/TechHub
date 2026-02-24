import path from 'path';
import { randomUUID } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || 'local';

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
function getS3Client(): S3Client {
  if (!s3ClientInstance) {
    const region = process.env.S3_REGION;
    s3ClientInstance = new S3Client({ region });
  }
  return s3ClientInstance;
}

async function saveS3(file: File) {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error('S3_BUCKET not configured');
  const extension = path.extname(file.name) || '.png';
  const key = `uploads/${randomUUID()}${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const s3 = getS3Client();
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: file.type }));
  const region = process.env.S3_REGION;
  const url = region
    ? `https://${bucket}.s3.${region}.amazonaws.com/${key}`
    : `https://${bucket}.s3.amazonaws.com/${key}`;
  return url;
}

async function deleteS3(iconPath?: string) {
  if (!iconPath) return;
  const bucket = process.env.S3_BUCKET;
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
  const s3 = getS3Client();
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => null);
}

export async function saveIcon(file: File) {
  if (STORAGE_PROVIDER === 's3') return saveS3(file);
  return saveLocal(file);
}

export async function deleteIcon(iconPath?: string) {
  if (STORAGE_PROVIDER === 's3') return deleteS3(iconPath);
  return deleteLocal(iconPath);
}
