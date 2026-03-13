/**
 * SVG Processor Utility (V12 "The Architect")
 * Handles specialized CSS parsing, color sensing, and attribute mapping for inlined SVGs.
 */

export interface SvgRule {
    selector: string;
    declarations: string[];
    themeMode: 'dark' | 'light' | 'all';
}

/**
 * Maps CSS properties to SVG presentation attributes.
 * This acts as a strict whitelist for our style-to-attribute translation.
 */
export const styleToAttrMap: Record<string, string> = {
    'fill': 'fill', 'stroke': 'stroke', 'stroke-width': 'stroke-width',
    'stroke-linecap': 'stroke-linecap', 'stroke-linejoin': 'stroke-linejoin',
    'stroke-miterlimit': 'stroke-miterlimit', 'stroke-dasharray': 'stroke-dasharray',
    'opacity': 'opacity', 'display': 'display', 'visibility': 'visibility',
    'stop-color': 'stop-color', 'stop-opacity': 'stop-opacity',
    'fill-opacity': 'fill-opacity', 'stroke-opacity': 'stroke-opacity',
    'color': 'fill' // "color" property in SVG usually indicates the fill color for text/shapes
};

/**
 * Parses CSS blocks with balanced-brace awareness.
 * Effectively a mini-compiler for SVG internal styles.
 */
export function parseCssBlocks(fullCss: string): SvgRule[] {
    const extractedRules: SvgRule[] = [];
    let current = '';
    let stack = 0;
    let start = 0;

    // Pre-sanitize the CSS to remove !important before it hits the declarations
    const cleanCss = fullCss.replace(/\/\*[\s\S]*?\*\//g, '').replace(/!important/gi, '');

    for (let i = 0; i < cleanCss.length; i++) {
        if (cleanCss[i] === '{') {
            if (stack === 0) start = i;
            stack++;
        } else if (cleanCss[i] === '}') {
            stack--;
            if (stack === 0) {
                const header = cleanCss.substring(current.length, start).trim();
                const body = cleanCss.substring(start + 1, i).trim();
                if (header.toLowerCase().includes('@media')) {
                    const mode = header.toLowerCase().includes('dark') ? 'dark' :
                        header.toLowerCase().includes('light') ? 'light' : 'all';
                    const innerRules = parseInnerCss(body);
                    innerRules.forEach(r => extractedRules.push({ ...r, themeMode: mode as any }));
                } else if (header) {
                    extractedRules.push({
                        selector: header,
                        declarations: body.split(';').map(d => d.trim()).filter(Boolean),
                        themeMode: 'all'
                    });
                }
                current = cleanCss.substring(0, i + 1);
            }
        }
    }
    return extractedRules;
}

function parseInnerCss(inner: string) {
    const rules: { selector: string, declarations: string[] }[] = [];
    const ruleRegex = /([^{}]+)\s*{([^}]+)}/gi;
    let match;
    while ((match = ruleRegex.exec(inner)) !== null) {
        rules.push({ selector: match[1].trim(), declarations: match[2].split(';').map(d => d.trim()).filter(Boolean) });
    }
    return rules;
}

/**
 * Converts various color formats (Hex, RGB, HSL) to sRGB [r, g, b].
 */
export function getRGB(color: string): [number, number, number] | null {
    const low = color.toLowerCase().trim();
    if (['currentcolor', 'inherit', 'initial', 'none', 'unset', 'transparent'].includes(low)) return null;

    // 1. Hex
    if (low.startsWith('#')) {
        const hex = low.replace(/[^0-9a-f]/gi, '');
        if (hex.length === 3) return [parseInt(hex[0] + hex[0], 16), parseInt(hex[1] + hex[1], 16), parseInt(hex[2] + hex[2], 16)];
        if (hex.length === 6) return [parseInt(hex.substring(0, 2), 16), parseInt(hex.substring(2, 4), 16), parseInt(hex.substring(4, 6), 16)];
    }

    // 2. RGB / RGBA
    if (low.startsWith('rgb')) {
        const m = low.match(/[\d.]+/g);
        if (m && m.length >= 3) return [Math.round(parseFloat(m[0])), Math.round(parseFloat(m[1])), Math.round(parseFloat(m[2]))];
    }

    // 3. HSL / HSLA (V12 Enhancement)
    if (low.startsWith('hsl')) {
        const m = low.match(/[\d.]+/g);
        if (m && m.length >= 3) {
            const h = parseFloat(m[0]) / 360;
            const s = parseFloat(m[1]) / 100;
            const l = parseFloat(m[2]) / 100;
            return hslToRgb(h, s, l);
        }
    }

    // 4. Named colors
    const named: Record<string, [number, number, number]> = {
        'black': [0, 0, 0], 'white': [255, 255, 255], 'gray': [128, 128, 128], 'grey': [128, 128, 128],
        'silver': [192, 192, 192], 'red': [255, 0, 0], 'green': [0, 128, 0], 'blue': [0, 0, 255],
        'yellow': [255, 255, 0], 'magenta': [255, 0, 255], 'cyan': [0, 255, 255]
    };
    return named[low] || null;
}

/**
 * Helper: HSL to RGB conversion
 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    let r, g, b;
    if (s === 0) {
        r = g = b = l; // achromatic
    } else {
        const hue2rgb = (p: number, q: number, t: number) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/**
 * Detects if a color is "vibrant" (not monochrome).
 * Used to identify brand icons that should not be inverted.
 */
export function isVibrant(color: string): boolean {
    if (!color || ['none', 'currentColor', 'inherit', 'transparent', 'initial', 'unset'].includes(color.toLowerCase().trim())) return false;
    const rgb = getRGB(color);
    if (!rgb) return !['black', 'white', 'gray', 'grey', 'silver', 'whitesmoke', 'gainsboro', 'lightgray', 'darkgray', 'dimgray'].includes(color.toLowerCase().trim());
    const [r, g, b] = rgb;
    // If any color channel is significantly different, it's "colorful/brand"
    return Math.abs(r - g) > 20 || Math.abs(g - b) > 20 || Math.abs(r - b) > 20;
}

/**
 * Detects if a color is near-black.
 * Used for adaptive inversion in dark mode.
 */
export function isNearBlack(color: string): boolean {
    const low = color.toLowerCase().trim();
    if (low === 'black' || low === '#000' || low === '#000000') return true;
    const rgb = getRGB(color);
    if (!rgb) return false;
    const [r, g, b] = rgb;
    // Perceptual luminance check (weighted for human eye)
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum < 0.22; // Catch anything reasonably dark
}
