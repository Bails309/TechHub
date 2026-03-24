import { describe, it, expect } from 'vitest';
import { sanitizeIconUrl } from '../src/lib/sanitizeIconUrl';

describe('sanitizeIconUrl – gap coverage', () => {
  const origin = 'https://app.example.com';

  it('allows Azure Blob Storage URLs with /uploads/ path', () => {
    const url = 'https://myaccount.blob.core.windows.net/mycontainer/uploads/icon.png';
    expect(sanitizeIconUrl(url, origin)).toBe('/uploads/icon.png');
  });

  it('allows Azurite (localhost) blob URLs with /uploads/', () => {
    const url = 'http://127.0.0.1:10000/devstoreaccount1/uploads/icon.png';
    expect(sanitizeIconUrl(url, origin)).toBe('/uploads/icon.png');
  });

  it('allows localhost blob URLs with /uploads/', () => {
    const url = 'http://localhost:10000/devstoreaccount1/uploads/icon.png';
    expect(sanitizeIconUrl(url, origin)).toBe('/uploads/icon.png');
  });

  it('returns null when origin is not provided and window is undefined', () => {
    expect(sanitizeIconUrl('/uploads/icon.png')).toBeNull();
  });

  it('returns null for malformed URLs', () => {
    expect(sanitizeIconUrl('://bad-url', origin)).toBeNull();
  });

  it('blocks S3 URLs without configured allowedS3Hostname', () => {
    const s3Url = 'https://mybucket.s3.us-east-1.amazonaws.com/uploads/icon.png';
    // No allowedS3Hostname provided
    expect(sanitizeIconUrl(s3Url, origin)).toBeNull();
  });

  it('blocks S3 URLs when hostname does not match allowedS3Hostname', () => {
    const s3Url = 'https://otherbucket.s3.us-east-1.amazonaws.com/uploads/icon.png';
    expect(sanitizeIconUrl(s3Url, origin, 'mybucket.s3.us-east-1.amazonaws.com')).toBeNull();
  });
});
