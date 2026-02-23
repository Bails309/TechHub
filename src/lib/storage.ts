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
  const uploadsDir = 'uploads';
  if (!rel.startsWith(uploadsDir + '/')) return;
  const full = path.join(process.cwd(), rel);
  try {
    await import('fs/promises').then((fs) => fs.unlink(full)).catch(() => null);
  } catch {
    // ignore
  }
}

// S3 implementation
function createS3Client() {
  const region = process.env.S3_REGION;
  const client = new S3Client({ region });
  return client;
}

async function saveS3(file: File) {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error('S3_BUCKET not configured');
  const extension = path.extname(file.name) || '.png';
  const key = `uploads/${randomUUID()}${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const client = createS3Client();
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: file.type }));
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
    if (url.hostname.endsWith('.amazonaws.com')) {
      key = url.pathname.replace(/^\//, '');
    }
  } catch {
    // not a URL
  }
  const client = createS3Client();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => null);
}

export async function saveIcon(file: File) {
  if (STORAGE_PROVIDER === 's3') return saveS3(file);
  return saveLocal(file);
}

export async function deleteIcon(iconPath?: string) {
  if (STORAGE_PROVIDER === 's3') return deleteS3(iconPath);
  return deleteLocal(iconPath);
}
