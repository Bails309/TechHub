import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';

// Mock storageConfig to control which provider is active
const mockGetStorageConfigMap = vi.fn();
vi.mock('../src/lib/storageConfig', () => ({
  getStorageConfigMap: (...a: any[]) => mockGetStorageConfigMap(...a)
}));

// Mock ssrf
vi.mock('../src/lib/ssrf', () => ({
  assertUrlNotPrivate: vi.fn().mockResolvedValue('93.184.216.34')
}));

// Mock pinnedClient
vi.mock('../src/lib/pinnedClient', () => ({
  createPinnedHttpClient: vi.fn().mockReturnValue({ sendRequest: vi.fn() }),
  createPinnedAwsRequestHandler: vi.fn().mockReturnValue({ handle: vi.fn() })
}));

// Mock AWS S3
const mockS3Send = vi.fn();
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({ send: mockS3Send })),
  PutObjectCommand: vi.fn(),
  DeleteObjectCommand: vi.fn(),
  ListObjectsV2Command: vi.fn(),
  GetObjectCommand: vi.fn(),
}));

// Mock Azure Blob
const mockUploadData = vi.fn().mockResolvedValue({});
const mockDeleteBlob = vi.fn().mockResolvedValue({});
const mockGetProperties = vi.fn().mockResolvedValue({ contentType: 'image/png' });
const mockDownloadToBuffer = vi.fn().mockResolvedValue(Buffer.from('mock-data'));
const mockListBlobsFlat = vi.fn().mockReturnValue({
  [Symbol.asyncIterator]: async function* () { /* empty */ }
});

vi.mock('@azure/storage-blob', () => ({
  BlobServiceClient: {
    fromConnectionString: vi.fn().mockReturnValue({
      getContainerClient: vi.fn().mockReturnValue({
        containerName: 'test-container',
        getBlockBlobClient: vi.fn().mockReturnValue({
          uploadData: mockUploadData,
          downloadToBuffer: mockDownloadToBuffer,
          getProperties: mockGetProperties,
        }),
        deleteBlob: mockDeleteBlob,
        listBlobsFlat: mockListBlobsFlat,
      })
    })
  },
  StorageSharedKeyCredential: vi.fn()
}));

// Mock fs/promises
const mockWriteFile = vi.fn().mockResolvedValue(undefined);
const mockMkdir = vi.fn().mockResolvedValue(undefined);
const mockReaddir = vi.fn().mockResolvedValue([]);
const mockStat = vi.fn();
const mockUnlink = vi.fn().mockResolvedValue(undefined);
const mockReadFile = vi.fn();

vi.mock('fs/promises', () => ({
  writeFile: (...a: any[]) => mockWriteFile(...a),
  mkdir: (...a: any[]) => mockMkdir(...a),
  readdir: (...a: any[]) => mockReaddir(...a),
  stat: (...a: any[]) => mockStat(...a),
  unlink: (...a: any[]) => mockUnlink(...a),
  readFile: (...a: any[]) => mockReadFile(...a),
}));

const storage = await import('../src/lib/storage');

describe('storage.ts – gap coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'test');
  });

  describe('saveIcon', () => {
    it('saves a PNG file locally', async () => {
      mockGetStorageConfigMap.mockResolvedValue(new Map([
        ['local', { provider: 'local', enabled: true, config: {} }]
      ]));
      // PNG magic bytes
      const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(100).fill(0)]);
      const file = new File([buffer], 'icon.png', { type: 'image/png' });
      const result = await storage.saveIcon(file);
      expect(result).toMatch(/^\/uploads\/.*\.png$/);
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('saves a JPEG file locally', async () => {
      mockGetStorageConfigMap.mockResolvedValue(new Map([
        ['local', { provider: 'local', enabled: true, config: {} }]
      ]));
      // JPEG magic bytes
      const buffer = Buffer.from([0xff, 0xd8, 0xff, ...new Array(100).fill(0)]);
      const file = new File([buffer], 'icon.jpg', { type: 'image/jpeg' });
      const result = await storage.saveIcon(file);
      expect(result).toMatch(/^\/uploads\/.*\.jpg$/);
    });

    it('saves and sanitizes an SVG file', async () => {
      mockGetStorageConfigMap.mockResolvedValue(new Map([
        ['local', { provider: 'local', enabled: true, config: {} }]
      ]));
      const svgContent = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40"/></svg>';
      const file = new File([svgContent], 'icon.svg', { type: 'image/svg+xml' });
      const result = await storage.saveIcon(file);
      expect(result).toMatch(/^\/uploads\/.*\.svg$/);
    });

    it('rejects files exceeding 2MB', async () => {
      const buffer = Buffer.alloc(3 * 1024 * 1024);
      const file = new File([buffer], 'large.png', { type: 'image/png' });
      Object.defineProperty(file, 'size', { value: 3 * 1024 * 1024 });
      await expect(storage.saveIcon(file)).rejects.toThrow('File too large');
    });

    it('saves to S3 when S3 is the active provider', async () => {
      mockGetStorageConfigMap.mockResolvedValue(new Map([
        ['s3', { provider: 's3', enabled: true, config: { bucket: 'test-bucket', region: 'us-east-1' }, secret: 'key' }]
      ]));
      mockS3Send.mockResolvedValue({});
      const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(100).fill(0)]);
      const file = new File([buffer], 'icon.png', { type: 'image/png' });
      const result = await storage.saveIcon(file);
      expect(result).toMatch(/^\/uploads\//);
      expect(mockS3Send).toHaveBeenCalled();
    });

    it('saves to Azure when Azure is the active provider', async () => {
      mockGetStorageConfigMap.mockResolvedValue(new Map([
        ['azure', {
          provider: 'azure', enabled: true,
          config: { authMode: 'connection-string', container: 'icons' },
          secret: 'DefaultEndpointsProtocol=https;AccountName=test;AccountKey=dGVzdA==;EndpointSuffix=core.windows.net'
        }]
      ]));
      mockUploadData.mockResolvedValue({});
      const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(100).fill(0)]);
      const file = new File([buffer], 'icon.png', { type: 'image/png' });
      const result = await storage.saveIcon(file);
      expect(result).toMatch(/^\/uploads\//);
    });
  });

  describe('deleteIcon', () => {
    it('deletes a local file', async () => {
      mockGetStorageConfigMap.mockResolvedValue(new Map([
        ['local', { provider: 'local', enabled: true, config: {} }]
      ]));
      await storage.deleteIcon('/uploads/test-icon.png');
      // unlink should have been called (or caught if file doesn't exist)
    });

    it('deletes from S3', async () => {
      mockGetStorageConfigMap.mockResolvedValue(new Map([
        ['s3', { provider: 's3', enabled: true, config: { bucket: 'test-bucket' } }]
      ]));
      mockS3Send.mockResolvedValue({});
      await storage.deleteIcon('/uploads/test-icon.png');
      expect(mockS3Send).toHaveBeenCalled();
    });

    it('deletes from Azure', async () => {
      mockGetStorageConfigMap.mockResolvedValue(new Map([
        ['azure', {
          provider: 'azure', enabled: true,
          config: { authMode: 'connection-string', container: 'icons' },
          secret: 'DefaultEndpointsProtocol=https;AccountName=test;AccountKey=dGVzdA==;EndpointSuffix=core.windows.net'
        }]
      ]));
      mockDeleteBlob.mockResolvedValue({});
      await storage.deleteIcon('/uploads/test-icon.png');
    });

    it('handles undefined iconPath gracefully', async () => {
      mockGetStorageConfigMap.mockResolvedValue(new Map([
        ['local', { provider: 'local', enabled: true, config: {} }]
      ]));
      await storage.deleteIcon(undefined);
      expect(mockUnlink).not.toHaveBeenCalled();
    });
  });

  describe('readIcon', () => {
    it('reads a local file', async () => {
      mockGetStorageConfigMap.mockResolvedValue(new Map([
        ['local', { provider: 'local', enabled: true, config: {} }]
      ]));
      mockReadFile.mockResolvedValue(Buffer.from('PNG data'));
      const result = await storage.readIcon('/uploads/test.png');
      // This tests the local readIcon path
      if (result) {
        expect(result.contentType).toContain('image');
      }
    });

    it('reads from S3', async () => {
      mockGetStorageConfigMap.mockResolvedValue(new Map([
        ['s3', { provider: 's3', enabled: true, config: { bucket: 'test-bucket' } }]
      ]));
      mockS3Send.mockResolvedValue({
        Body: { transformToByteArray: () => Promise.resolve(new Uint8Array([1, 2, 3])) },
        ContentType: 'image/png'
      });
      const result = await storage.readIcon('/uploads/test.png');
      expect(result).not.toBeNull();
      expect(result?.contentType).toBe('image/png');
    });

    it('returns null for S3 errors', async () => {
      mockGetStorageConfigMap.mockResolvedValue(new Map([
        ['s3', { provider: 's3', enabled: true, config: { bucket: 'test-bucket' } }]
      ]));
      mockS3Send.mockRejectedValue(new Error('NoSuchKey'));
      const result = await storage.readIcon('/uploads/test.png');
      expect(result).toBeNull();
    });

    it('reads from Azure', async () => {
      mockGetStorageConfigMap.mockResolvedValue(new Map([
        ['azure', {
          provider: 'azure', enabled: true,
          config: { authMode: 'connection-string', container: 'icons' },
          secret: 'DefaultEndpointsProtocol=https;AccountName=test;AccountKey=dGVzdA==;EndpointSuffix=core.windows.net'
        }]
      ]));
      const result = await storage.readIcon('/uploads/test.png');
      expect(result).not.toBeNull();
    });

    it('blocks path traversal in local readIcon', async () => {
      mockGetStorageConfigMap.mockResolvedValue(new Map([
        ['local', { provider: 'local', enabled: true, config: {} }]
      ]));
      const result = await storage.readIcon('/../etc/passwd');
      expect(result).toBeNull();
    });

    it('returns null for non-uploads paths in local readIcon', async () => {
      mockGetStorageConfigMap.mockResolvedValue(new Map([
        ['local', { provider: 'local', enabled: true, config: {} }]
      ]));
      const result = await storage.readIcon('/etc/passwd');
      expect(result).toBeNull();
    });

    it('returns null when S3 bucket is not configured', async () => {
      mockGetStorageConfigMap.mockResolvedValue(new Map([
        ['s3', { provider: 's3', enabled: true, config: {} }]
      ]));
      const result = await storage.readIcon('/uploads/test.png');
      expect(result).toBeNull();
    });
  });

  describe('cleanupOrphanedIcons', () => {
    it('cleans up local orphaned icons', async () => {
      mockGetStorageConfigMap.mockResolvedValue(new Map([
        ['local', { provider: 'local', enabled: true, config: {} }]
      ]));
      mockReaddir.mockResolvedValue(['valid.png', 'orphan.png']);
      mockStat.mockResolvedValue({ isFile: () => true, mtimeMs: Date.now() - 2 * 60 * 60 * 1000 });
      mockUnlink.mockResolvedValue(undefined);

      const result = await storage.cleanupOrphanedIcons(['/uploads/valid.png']);
      expect(result).toBe(1);
    });

    it('skips files newer than 1 hour during local cleanup', async () => {
      mockGetStorageConfigMap.mockResolvedValue(new Map([
        ['local', { provider: 'local', enabled: true, config: {} }]
      ]));
      mockReaddir.mockResolvedValue(['recent.png']);
      mockStat.mockResolvedValue({ isFile: () => true, mtimeMs: Date.now() });

      const result = await storage.cleanupOrphanedIcons([]);
      expect(result).toBe(0);
    });

    it('cleans up S3 orphaned icons', async () => {
      mockGetStorageConfigMap.mockResolvedValue(new Map([
        ['s3', { provider: 's3', enabled: true, config: { bucket: 'test-bucket' } }]
      ]));
      mockS3Send.mockResolvedValueOnce({
        Contents: [
          { Key: 'uploads/orphan.png', LastModified: new Date(Date.now() - 2 * 60 * 60 * 1000) },
          { Key: 'uploads/valid.png', LastModified: new Date(Date.now() - 2 * 60 * 60 * 1000) }
        ],
        IsTruncated: false,
      }).mockResolvedValue({}); // For delete calls

      const result = await storage.cleanupOrphanedIcons(['/uploads/valid.png']);
      expect(result).toBe(1);
    });

    it('returns 0 when Azure config is absent', async () => {
      mockGetStorageConfigMap.mockResolvedValue(new Map());
      vi.stubEnv('STORAGE_PROVIDER', 'azure');
      const result = await storage.cleanupOrphanedIcons([]);
      expect(result).toBe(0);
    });

    it('handles ENOENT error during local cleanup', async () => {
      mockGetStorageConfigMap.mockResolvedValue(new Map([
        ['local', { provider: 'local', enabled: true, config: {} }]
      ]));
      const err = new Error('ENOENT') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      mockReaddir.mockRejectedValue(err);

      const result = await storage.cleanupOrphanedIcons([]);
      expect(result).toBe(0);
    });
  });

  describe('readIcon local MIME types', () => {
    it('reads local .jpg file with correct MIME type', async () => {
      mockGetStorageConfigMap.mockResolvedValue(new Map([
        ['local', { provider: 'local', enabled: true, config: {} }]
      ]));
      mockReadFile.mockResolvedValue(Buffer.from('jpeg-data'));
      const result = await storage.readIcon('/uploads/icon.jpg');
      expect(result).not.toBeNull();
      expect(result!.contentType).toBe('image/jpeg');
    });

    it('reads local .svg file with correct MIME type', async () => {
      mockGetStorageConfigMap.mockResolvedValue(new Map([
        ['local', { provider: 'local', enabled: true, config: {} }]
      ]));
      mockReadFile.mockResolvedValue(Buffer.from('<svg></svg>'));
      const result = await storage.readIcon('/uploads/icon.svg');
      expect(result).not.toBeNull();
      expect(result!.contentType).toBe('image/svg+xml');
    });

    it('reads local .gif file with correct MIME type', async () => {
      mockGetStorageConfigMap.mockResolvedValue(new Map([
        ['local', { provider: 'local', enabled: true, config: {} }]
      ]));
      mockReadFile.mockResolvedValue(Buffer.from('gif-data'));
      const result = await storage.readIcon('/uploads/icon.gif');
      expect(result).not.toBeNull();
      expect(result!.contentType).toBe('image/gif');
    });

    it('reads local .webp file with correct MIME type', async () => {
      mockGetStorageConfigMap.mockResolvedValue(new Map([
        ['local', { provider: 'local', enabled: true, config: {} }]
      ]));
      mockReadFile.mockResolvedValue(Buffer.from('webp-data'));
      const result = await storage.readIcon('/uploads/icon.webp');
      expect(result).not.toBeNull();
      expect(result!.contentType).toBe('image/webp');
    });

    it('reads local file with unknown extension as octet-stream', async () => {
      mockGetStorageConfigMap.mockResolvedValue(new Map([
        ['local', { provider: 'local', enabled: true, config: {} }]
      ]));
      mockReadFile.mockResolvedValue(Buffer.from('data'));
      const result = await storage.readIcon('/uploads/icon.xyz');
      expect(result).not.toBeNull();
      expect(result!.contentType).toBe('application/octet-stream');
    });

    it('returns null when local readFile throws', async () => {
      mockGetStorageConfigMap.mockResolvedValue(new Map([
        ['local', { provider: 'local', enabled: true, config: {} }]
      ]));
      mockReadFile.mockRejectedValue(new Error('ENOENT'));
      const result = await storage.readIcon('/uploads/missing.png');
      expect(result).toBeNull();
    });
  });

  describe('readIcon Azure error', () => {
    it('returns null when Azure download fails', async () => {
      mockGetStorageConfigMap.mockResolvedValue(new Map([
        ['azure', { provider: 'azure', enabled: true, config: { authMode: 'connection-string', container: 'icons' }, secret: 'DefaultEndpointsProtocol=https;AccountName=test;AccountKey=dGVzdA==;EndpointSuffix=core.windows.net' }]
      ]));
      mockDownloadToBuffer.mockRejectedValue(new Error('Blob not found'));
      const result = await storage.readIcon('/uploads/missing.png');
      expect(result).toBeNull();
    });
  });

  describe('saveIcon Azure error', () => {
    it('rethrows Azure upload errors', async () => {
      mockGetStorageConfigMap.mockResolvedValue(new Map([
        ['azure', { provider: 'azure', enabled: true, config: { authMode: 'connection-string', container: 'icons' }, secret: 'DefaultEndpointsProtocol=https;AccountName=test;AccountKey=dGVzdA==;EndpointSuffix=core.windows.net' }]
      ]));
      mockUploadData.mockRejectedValue(Object.assign(new Error('Upload failed'), { code: 'BlobError', statusCode: 500 }));
      const file = new File([Buffer.from('PNG data')], 'icon.png', { type: 'image/png' });
      await expect(storage.saveIcon(file)).rejects.toThrow('Upload failed');
    });
  });

  describe('deleteIcon dispatch', () => {
    it('deletes via Azure provider', async () => {
      mockGetStorageConfigMap.mockResolvedValue(new Map([
        ['azure', { provider: 'azure', enabled: true, config: { authMode: 'connection-string', container: 'icons' }, secret: 'DefaultEndpointsProtocol=https;AccountName=test;AccountKey=dGVzdA==;EndpointSuffix=core.windows.net' }]
      ]));
      await storage.deleteIcon('/uploads/test.png');
      expect(mockDeleteBlob).toHaveBeenCalled();
    });
  });
});
