import { describe, it, expect } from 'vitest';
import { isPublicIp } from '../src/lib/ssrf';

describe('ssrf – gap coverage', () => {
  it('returns false for unparseable IP addresses', () => {
    expect(isPublicIp('not-an-ip')).toBe(false);
    expect(isPublicIp('')).toBe(false);
  });
});
