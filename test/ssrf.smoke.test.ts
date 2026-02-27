import { describe, it, expect } from 'vitest';
import { isPublicIp } from '../src/lib/ssrf';

describe('ssrf helper smoke', () => {
  it('recognizes public and private IPs', () => {
    expect(isPublicIp('8.8.8.8')).toBe(true);
    expect(isPublicIp('127.0.0.1')).toBe(false);
    expect(isPublicIp('10.0.0.1')).toBe(false);
  });
});
