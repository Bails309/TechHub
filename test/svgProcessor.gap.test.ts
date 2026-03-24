import { describe, it, expect } from 'vitest';
import { getRGB } from '../src/lib/svg-processor';

describe('svg-processor – gap coverage', () => {
  it('handles achromatic HSL colors (saturation = 0)', () => {
    // hsl(0, 0%, 50%) → all channels = 0.5 * 255 = 128
    const result = getRGB('hsl(0, 0%, 50%)');
    expect(result).toEqual([128, 128, 128]);
  });

  it('handles achromatic HSL black (s=0, l=0)', () => {
    const result = getRGB('hsl(0, 0%, 0%)');
    expect(result).toEqual([0, 0, 0]);
  });

  it('handles achromatic HSL white (s=0, l=100)', () => {
    const result = getRGB('hsl(0, 0%, 100%)');
    expect(result).toEqual([255, 255, 255]);
  });
});
