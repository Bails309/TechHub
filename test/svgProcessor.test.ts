import { describe, it, expect } from 'vitest';
import { parseCssBlocks, styleToAttrMap, isVibrant, isNearBlack, getRGB } from '../src/lib/svg-processor';

describe('getRGB', () => {
    it('parses 3-digit hex colors', () => {
        expect(getRGB('#f00')).toEqual([255, 0, 0]);
    });

    it('parses 6-digit hex colors', () => {
        expect(getRGB('#00ff00')).toEqual([0, 255, 0]);
    });

    it('parses rgb() colors', () => {
        expect(getRGB('rgb(128, 64, 32)')).toEqual([128, 64, 32]);
    });

    it('parses hsl() colors', () => {
        // hsl(0, 100%, 50%) = pure red
        const result = getRGB('hsl(0, 100%, 50%)');
        expect(result).toBeTruthy();
        expect(result![0]).toBe(255);
        expect(result![1]).toBe(0);
        expect(result![2]).toBe(0);
    });

    it('parses named colors', () => {
        expect(getRGB('black')).toEqual([0, 0, 0]);
        expect(getRGB('white')).toEqual([255, 255, 255]);
        expect(getRGB('red')).toEqual([255, 0, 0]);
    });

    it('returns null for special values', () => {
        expect(getRGB('currentColor')).toBeNull();
        expect(getRGB('inherit')).toBeNull();
        expect(getRGB('none')).toBeNull();
        expect(getRGB('transparent')).toBeNull();
    });

    it('returns null for unrecognized color names', () => {
        expect(getRGB('unknowncolor')).toBeNull();
    });
});

describe('isVibrant', () => {
    it('detects vibrant colors', () => {
        expect(isVibrant('#ff0000')).toBe(true);
        expect(isVibrant('rgb(0, 128, 255)')).toBe(true);
    });

    it('rejects achromatic colors', () => {
        expect(isVibrant('#808080')).toBe(false);
        expect(isVibrant('gray')).toBe(false);
        expect(isVibrant('black')).toBe(false);
        expect(isVibrant('white')).toBe(false);
    });

    it('returns false for none and transparent', () => {
        expect(isVibrant('none')).toBe(false);
        expect(isVibrant('transparent')).toBe(false);
    });

    it('treats currentColor as vibrant (unknown named color heuristic)', () => {
        // currentColor is not in the named colors map and not in the special exclusion list,
        // so isVibrant treats it as potentially colorful
        expect(isVibrant('currentColor')).toBe(true);
    });
});

describe('isNearBlack', () => {
    it('detects black', () => {
        expect(isNearBlack('black')).toBe(true);
        expect(isNearBlack('#000')).toBe(true);
        expect(isNearBlack('#000000')).toBe(true);
    });

    it('detects near-black colors', () => {
        expect(isNearBlack('#1a1a1a')).toBe(true);
        expect(isNearBlack('rgb(10, 10, 10)')).toBe(true);
    });

    it('rejects light colors', () => {
        expect(isNearBlack('white')).toBe(false);
        expect(isNearBlack('#cccccc')).toBe(false);
        expect(isNearBlack('rgb(200, 200, 200)')).toBe(false);
    });
});

describe('parseCssBlocks', () => {
    it('parses simple CSS rules', () => {
        const css = '.cls1 { fill: #ff0000; stroke: #000; }';
        const rules = parseCssBlocks(css);
        expect(rules.length).toBeGreaterThanOrEqual(1);
        expect(rules[0].selector).toBe('.cls1');
        expect(rules[0].themeMode).toBe('all');
        expect(rules[0].declarations).toContain('fill: #ff0000');
    });

    it('parses @media rules for dark theme', () => {
        const css = '@media (prefers-color-scheme: dark) { .icon { fill: white; } }';
        const rules = parseCssBlocks(css);
        expect(rules.length).toBeGreaterThanOrEqual(1);
        const darkRule = rules.find(r => r.themeMode === 'dark');
        expect(darkRule).toBeDefined();
    });

    it('parses @media rules for light theme', () => {
        const css = '@media (prefers-color-scheme: light) { .icon { fill: black; } }';
        const rules = parseCssBlocks(css);
        const lightRule = rules.find(r => r.themeMode === 'light');
        expect(lightRule).toBeDefined();
    });

    it('strips !important from declarations', () => {
        const css = '.cls1 { fill: red !important; }';
        const rules = parseCssBlocks(css);
        expect(rules.length).toBeGreaterThanOrEqual(1);
        expect(rules[0].declarations.join(';')).not.toContain('!important');
    });

    it('returns empty for empty input', () => {
        expect(parseCssBlocks('')).toEqual([]);
    });
});

describe('styleToAttrMap', () => {
    it('maps fill to fill', () => {
        expect(styleToAttrMap['fill']).toBe('fill');
    });

    it('maps stroke to stroke', () => {
        expect(styleToAttrMap['stroke']).toBe('stroke');
    });

    it('maps color to fill', () => {
        expect(styleToAttrMap['color']).toBe('fill');
    });

    it('does not map unknown properties', () => {
        expect(styleToAttrMap['background']).toBeUndefined();
    });

    it('maps new properties like filter and transform', () => {
        expect(styleToAttrMap['filter']).toBe('filter');
        expect(styleToAttrMap['transform']).toBe('transform');
        expect(styleToAttrMap['flood-color']).toBe('flood-color');
    });
});
