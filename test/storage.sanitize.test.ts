import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for the sanitizeSvg function's dangerous scheme detection logic,
 * exercised through saveIcon (which calls sanitizeSvg internally).
 * Covers the transformTags handler that strips javascript:, vbscript:,
 * and non-raster data: URIs from href/xlink:href (lines 406-424 in storage.ts).
 */

// Mock storageConfig
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
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(function () {
    return { send: vi.fn() };
  }),
  PutObjectCommand: vi.fn(),
  DeleteObjectCommand: vi.fn(),
  ListObjectsV2Command: vi.fn(),
  GetObjectCommand: vi.fn(),
}));

// Mock Azure Blob
vi.mock('@azure/storage-blob', () => ({
  BlobServiceClient: {
    fromConnectionString: vi.fn().mockReturnValue({
      getContainerClient: vi.fn().mockReturnValue({
        containerName: 'test-container',
        getBlockBlobClient: vi.fn().mockReturnValue({ uploadData: vi.fn() }),
      })
    })
  },
  StorageSharedKeyCredential: vi.fn()
}));

// Mock fs/promises — capture what's written
let lastWrittenContent = '';
const mockWriteFile = vi.fn().mockImplementation(async (_path: any, content: any) => {
  lastWrittenContent = typeof content === 'string' ? content : content.toString('utf-8');
});
vi.mock('fs/promises', () => ({
  writeFile: (...a: any[]) => mockWriteFile(...a),
  mkdir: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
  stat: vi.fn(),
  unlink: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
}));

import * as storage from '../src/lib/storage';

/** Helper: create an SVG File from content string and run it through saveIcon */
async function saveSvgAndGetContent(svgContent: string): Promise<string> {
  lastWrittenContent = '';
  const file = new File([svgContent], 'test.svg', { type: 'image/svg+xml' });
  await storage.saveIcon(file);
  return lastWrittenContent;
}

describe('storage.ts – sanitizeSvg dangerous scheme stripping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetStorageConfigMap.mockResolvedValue(new Map([
      ['local', { provider: 'local', enabled: true, config: {} }]
    ]));
  });

  describe('javascript: scheme removal', () => {
    it('strips javascript: from href attributes', async () => {
      const saved = await saveSvgAndGetContent(
        '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><text>Click</text></a></svg>'
      );
      expect(saved).not.toContain('javascript:');
    });

    it('strips javascript: from xlink:href attributes', async () => {
      const saved = await saveSvgAndGetContent(
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="javascript:alert(1)"/></svg>'
      );
      expect(saved).not.toContain('javascript:');
    });

    it('strips javascript: with leading whitespace', async () => {
      const saved = await saveSvgAndGetContent(
        '<svg xmlns="http://www.w3.org/2000/svg"><a href="  javascript:alert(1)"><text>X</text></a></svg>'
      );
      expect(saved).not.toContain('javascript:');
    });
  });

  describe('vbscript: scheme removal', () => {
    it('strips vbscript: from href attributes', async () => {
      const saved = await saveSvgAndGetContent(
        '<svg xmlns="http://www.w3.org/2000/svg"><a href="vbscript:MsgBox(1)"><text>Click</text></a></svg>'
      );
      expect(saved).not.toContain('vbscript:');
    });
  });

  describe('data: URI filtering', () => {
    it('allows data:image/png;base64 in href', async () => {
      const saved = await saveSvgAndGetContent(
        '<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,iVBORw0KGgo=" width="10" height="10"/></svg>'
      );
      expect(saved).toContain('data:image/png;base64,');
    });

    it('allows data:image/jpeg;base64 in href', async () => {
      const saved = await saveSvgAndGetContent(
        '<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/jpeg;base64,/9j/4AAQ=" width="10" height="10"/></svg>'
      );
      expect(saved).toContain('data:image/jpeg;base64,');
    });

    it('strips data:image/svg+xml (dangerous recursive SVG)', async () => {
      const saved = await saveSvgAndGetContent(
        '<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/svg+xml;base64,PHN2Zz4=" width="10" height="10"/></svg>'
      );
      expect(saved).not.toContain('data:image/svg+xml');
    });

    it('strips data:text/html (XSS vector)', async () => {
      const saved = await saveSvgAndGetContent(
        '<svg xmlns="http://www.w3.org/2000/svg"><a href="data:text/html,<script>alert(1)</script>"><text>X</text></a></svg>'
      );
      expect(saved).not.toContain('data:text/html');
    });
  });

  describe('safe schemes preserved', () => {
    it('preserves https: href on image elements', async () => {
      const saved = await saveSvgAndGetContent(
        '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/img.png" width="10" height="10"/></svg>'
      );
      expect(saved).toContain('https://example.com/img.png');
    });

    it('preserves http: href on image elements', async () => {
      const saved = await saveSvgAndGetContent(
        '<svg xmlns="http://www.w3.org/2000/svg"><image href="http://example.com/img.png" width="10" height="10"/></svg>'
      );
      expect(saved).toContain('http://example.com/img.png');
    });
  });
});
