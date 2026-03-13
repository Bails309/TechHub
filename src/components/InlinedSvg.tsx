'use client';
// Version: antigravity-ultimate-v5

import { useEffect, useState, useId } from 'react';
import { useNonce } from './NonceProvider';
import { useTheme } from './ThemeProvider';

interface InlinedSvgProps {
    src: string;
    className?: string;
    fallback?: React.ReactNode;
}

export default function InlinedSvg({ src, className, fallback }: InlinedSvgProps) {
    const [rawContent, setRawContent] = useState<string | null>(null);
    const [svgContent, setSvgContent] = useState<string | null>(null);
    const [error, setError] = useState(false);
    const { theme } = useTheme();
    const nonce = useNonce();
    const instanceId = useId().replace(/:/g, '');
    const prefix = `svg-${instanceId}-`;

    // 1. Fetch the raw SVG content
    useEffect(() => {
        let isMounted = true;

        async function fetchSvg() {
            try {
                const response = await fetch(src);
                if (!response.ok) throw new Error('Failed to fetch SVG');
                const text = await response.text();
                if (isMounted) {
                    setRawContent(text);
                    setError(false);
                }
            } catch (err) {
                console.error('Error fetching SVG:', err);
                if (isMounted) setError(true);
            }
        }

        if (src) {
            fetchSvg();
        } else {
            setError(true);
        }

        return () => { isMounted = false; };
    }, [src]);

    // 2. Process the SVG content when rawContent or theme changes
    useEffect(() => {
        if (!rawContent) return;

        try {
            // THE CACHE CRUSHER (V11): Explicit diagnostics to defeat build desync
            const extractedRules: { selector: string, declarations: string[], themeMode: 'dark' | 'light' | 'all' }[] = [];

            // 1. Balanced-Brace CSS Parser
            function parseCssBlocks(fullCss: string) {
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

            // 2. Pre-Parser Sanitization
            const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
            let currentContent = rawContent;

            // Neutralize "svg { color: ... }" hardcoded defaults in the raw string
            currentContent = currentContent.replace(/svg\s*{[^}]*color\s*:[^}]*}/gi, '');

            let match;
            while ((match = styleRegex.exec(rawContent)) !== null) {
                parseCssBlocks(match[1]);
            }
            currentContent = currentContent.replace(styleRegex, '');

            const inlineMap = new Map<string, string>();
            let inlineCounter = 0;
            // Also neutralize !important in inline styles
            const inlineRegex = /\sstyle\s*=\s*(['"])([\s\S]*?)\1/gi;
            currentContent = currentContent.replace(inlineRegex, (m, q, s) => {
                const neutralized = s.replace(/!important/gi, '');
                const markerId = `v11-${++inlineCounter}`;
                inlineMap.set(markerId, neutralized);
                return ` data-v11-style="${markerId}"`;
            });

            // 3. Parse
            const parser = new DOMParser();
            let doc = parser.parseFromString(currentContent, 'image/svg+xml');
            let svg = doc.querySelector('svg');
            if (!svg || doc.querySelector('parsererror')) {
                doc = parser.parseFromString(currentContent, 'text/html');
                svg = doc.querySelector('svg');
            }
            if (!svg) throw new Error('V11-FAIL');

            // 4. Palette-Aware Brand Check (V11.4): The Authority
            let isBrandIcon = false;

            function getRGB(color: string): [number, number, number] | null {
                const low = color.toLowerCase().trim();
                // If it's currentColor or inherit, we can't determine brand/monochrome easily here, 
                // but usually these are used in monochrome icons.
                if (['currentcolor', 'inherit', 'initial', 'none', 'unset', 'transparent'].includes(low)) return null;

                if (low.startsWith('#')) {
                    const hex = low.replace(/[^0-9a-f]/gi, '');
                    if (hex.length === 3) return [parseInt(hex[0] + hex[0], 16), parseInt(hex[1] + hex[1], 16), parseInt(hex[2] + hex[2], 16)];
                    if (hex.length === 6) return [parseInt(hex.substring(0, 2), 16), parseInt(hex.substring(2, 4), 16), parseInt(hex.substring(4, 6), 16)];
                }
                if (low.startsWith('rgb')) {
                    const m = low.match(/\d+/g);
                    if (m && m.length >= 3) return [parseInt(m[0]), parseInt(m[1]), parseInt(m[2])];
                }
                const named: Record<string, [number, number, number]> = {
                    'black': [0, 0, 0], 'white': [255, 255, 255], 'gray': [128, 128, 128], 'grey': [128, 128, 128],
                    'silver': [192, 192, 192], 'red': [255, 0, 0], 'green': [0, 128, 0], 'blue': [0, 0, 255]
                };
                return named[low] || null;
            }

            function isVibrant(color: string) {
                if (!color || ['none', 'currentColor', 'inherit', 'transparent', 'initial', 'unset'].includes(color.toLowerCase().trim())) return false;
                const rgb = getRGB(color);
                // If we can't parse it as monochrome, assume it's potentially brand
                if (!rgb) return !['black', 'white', 'gray', 'grey', 'silver', 'whitesmoke', 'gainsboro', 'lightgray', 'darkgray', 'dimgray'].includes(color.toLowerCase().trim());
                const [r, g, b] = rgb;
                // If any color channel is significantly different, it's "colorful/brand"
                return Math.abs(r - g) > 20 || Math.abs(g - b) > 20 || Math.abs(r - b) > 20;
            }

            function isNearBlack(color: string) {
                const low = color.toLowerCase().trim();
                if (low === 'black' || low === '#000' || low === '#000000') return true;
                const rgb = getRGB(color);
                if (!rgb) return false;
                const [r, g, b] = rgb;
                // Perceptual luminance check (weighted for human eye)
                const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                return lum < 0.22; // Catch anything reasonably dark
            }

            // Scan the inlineMap (crucial for detecting colors in style= attributes)
            inlineMap.forEach((styleStr) => {
                styleStr.split(';').forEach(pair => {
                    const val = pair.split(':')[1]?.trim();
                    if (val && isVibrant(val)) isBrandIcon = true;
                });
            });

            // Scan extracted rules for brand colors
            extractedRules.forEach(r => r.declarations.forEach(d => {
                const val = d.split(':')[1]?.trim();
                if (val && isVibrant(val)) isBrandIcon = true;
            }));

            // Scan attributes for brand colors
            svg.querySelectorAll('*').forEach(el => {
                ['fill', 'stroke', 'stop-color', 'color'].forEach(a => {
                    const v = el.getAttribute(a);
                    if (v && isVibrant(v)) isBrandIcon = true;
                });
            });

            const currentTheme = (theme || 'dark').toLowerCase();
            const touchedElements = new Set<Element>();
            const styleToAttrMap: Record<string, string> = {
                'fill': 'fill', 'stroke': 'stroke', 'stroke-width': 'stroke-width',
                'stroke-linecap': 'stroke-linecap', 'stroke-linejoin': 'stroke-linejoin',
                'stroke-miterlimit': 'stroke-miterlimit', 'stroke-dasharray': 'stroke-dasharray',
                'opacity': 'opacity', 'display': 'display', 'visibility': 'visibility',
                'stop-color': 'stop-color', 'stop-opacity': 'stop-opacity',
                'fill-opacity': 'fill-opacity', 'stroke-opacity': 'stroke-opacity',
                'color': 'fill'
            };

            // Force SVG root to allow inheritance (neutralize hardcoded black roots)
            svg.removeAttribute('color');

            // 5. Apply Inlines (Neutralized)
            svg.querySelectorAll('[data-v11-style]').forEach(el => {
                const sval = inlineMap.get(el.getAttribute('data-v11-style') || '');
                if (sval) {
                    sval.split(';').forEach(p => {
                        const [k, v] = p.split(':').map(x => x?.trim());
                        if (k && v && styleToAttrMap[k.toLowerCase()]) {
                            el.setAttribute(styleToAttrMap[k.toLowerCase()], v);
                            if (['fill', 'stroke', 'color'].includes(k.toLowerCase())) touchedElements.add(el);
                        }
                    });
                }
                el.removeAttribute('data-v11-style');
            });

            // 6. Apply Rules (Neutralized)
            ['all', currentTheme].forEach(mode => {
                extractedRules.filter(r => r.themeMode === mode).forEach(rule => {
                    const selector = rule.selector.replace(/^svg\s+/i, '') || 'svg';
                    try {
                        const targets = svg!.matches(selector) ? [svg!, ...Array.from(svg!.querySelectorAll(selector))] : Array.from(svg!.querySelectorAll(selector));
                        targets.forEach(el => {
                            rule.declarations.forEach(d => {
                                const cIdx = d.indexOf(':');
                                if (cIdx === -1) return;
                                const prop = d.substring(0, cIdx).trim().toLowerCase();
                                const val = d.substring(cIdx + 1).trim();
                                if (styleToAttrMap[prop]) {
                                    el.setAttribute(styleToAttrMap[prop], val);
                                    if (['fill', 'stroke', 'color'].includes(prop)) touchedElements.add(el);
                                }
                            });
                        });
                    } catch (e) { }
                });
            });

            // 7. Policy V3 (Brand-Aware)
            const isDark = currentTheme === 'dark';
            const allNodes = [svg, ...Array.from(svg.querySelectorAll('*'))];
            allNodes.forEach(el => {
                const tag = el.tagName.toLowerCase();
                const shapeTags = ['path', 'circle', 'rect', 'ellipse', 'polygon', 'polyline', 'text', 'line'];
                if (shapeTags.includes(tag)) {
                    const fill = el.getAttribute('fill');
                    const stroke = el.getAttribute('stroke');

                    // a. Dynamic Inversion for Monochrome icons ONLY (V11.4: Neutralizing !important legacy)
                    if (isDark && !isBrandIcon) {
                        const isDarkFill = fill && isNearBlack(fill);
                        const isDarkStroke = stroke && isNearBlack(stroke);
                        const isCurrentColor = fill === 'currentColor' || stroke === 'currentColor';
                        const isInherit = fill === 'inherit' || stroke === 'inherit';

                        if ((isDarkFill || isDarkStroke || isCurrentColor || isInherit) && !touchedElements.has(el)) {
                            // Neutralize and force white for dark mode if it was flagged as "monochrome/sensing"
                            if (isDarkFill || isCurrentColor || isInherit || !fill) el.setAttribute('fill', 'currentColor');
                            if (isDarkStroke || isCurrentColor || isInherit) el.setAttribute('stroke', 'currentColor');
                        }
                    }

                    // b. Universal Fallback - Zero color elements
                    if (!el.hasAttribute('fill') && !el.hasAttribute('stroke') && !touchedElements.has(el)) {
                        let inherited = false;
                        let p = el.parentElement;
                        while (p && p !== svg!.parentElement) {
                            if (p.hasAttribute('fill') || p.hasAttribute('stroke')) { inherited = true; break; }
                            p = p.parentElement;
                        }
                        if (!inherited) {
                            if (!isBrandIcon) {
                                el.setAttribute('fill', 'currentColor');
                            }
                        }
                    }
                }

                // c. Namespacing
                const id = el.getAttribute('id'); if (id) el.setAttribute('id', `${prefix}${id}`);
                const cls = el.getAttribute('class'); if (cls) el.setAttribute('class', cls.split(/\s+/).map(c => `${prefix}${c}`).join(' '));
            });

            // 8. Restore Links
            allNodes.forEach(el => {
                ['fill', 'stroke', 'clip-path', 'mask', 'filter'].forEach(a => {
                    const v = el.getAttribute(a);
                    if (v?.includes('url(#')) el.setAttribute(a, v.replace(/url\(#([^)]+)\)/g, `url(#${prefix}$1)`));
                });
                ['href', 'xlink:href'].forEach(a => {
                    const v = el.getAttribute(a);
                    if (v?.startsWith('#')) el.setAttribute(a, `#${prefix}${v.substring(1)}`);
                });
            });

            if (isBrandIcon) svg.setAttribute('data-brand-detected', 'true');
            svg.setAttribute('data-provenance', `v11.5-${Date.now()}`);
            const output = new XMLSerializer().serializeToString(svg);
            if (isBrandIcon) console.warn(`[InlinedSvg V11.5] 🌈 ${src} - BRAND PROTECTED (Vibrant Detected)`);
            else console.info(`[InlinedSvg V11.5] 👤 ${src} - MONOCHROME (Sensing Enabled)`);
            setSvgContent(output);
        } catch (err) {
            console.error('[InlinedSvg V11.5] Fault:', err);
            setSvgContent(rawContent.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/\sstyle\s*=\s*(['"])(?:(?!\1)[\s\S]*?)\1/gi, ''));
        }
    }, [rawContent, theme, prefix, src]);


    if (error && fallback) return <>{fallback}</>;
    if (!svgContent) return <div className={className} />;

    return (
        <div
            className={className}
            dangerouslySetInnerHTML={{ __html: svgContent }}
        />
    );
}
