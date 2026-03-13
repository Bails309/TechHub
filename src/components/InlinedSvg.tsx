'use client';
// Version: antigravity-ultimate-v5

import { useEffect, useState, useId } from 'react';
import { useNonce } from './NonceProvider';
import { useTheme } from './ThemeProvider';
import {
    parseCssBlocks,
    styleToAttrMap,
    isVibrant,
    isNearBlack,
    SvgRule
} from '@/lib/svg-processor';

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
            // THE ARCHITECT (V12): Audit-ready architecture with separate processor
            let currentContent = rawContent;

            // 1. CSS Extraction
            const extractedRules: SvgRule[] = [];
            const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;

            // Neutralize "svg { color: ... }" hardcoded defaults in the raw string
            currentContent = currentContent.replace(/svg\s*{[^}]*color\s*:[^}]*}/gi, '');

            let match;
            while ((match = styleRegex.exec(rawContent)) !== null) {
                extractedRules.push(...parseCssBlocks(match[1]));
            }
            currentContent = currentContent.replace(styleRegex, '');

            // 2. Inline Style Neutralization
            const inlineMap = new Map<string, string>();
            let inlineCounter = 0;
            const inlineRegex = /\sstyle\s*=\s*(['"])([\s\S]*?)\1/gi;
            currentContent = currentContent.replace(inlineRegex, (m, q, s) => {
                const neutralized = s.replace(/!important/gi, '');
                const markerId = `v12-${++inlineCounter}`;
                inlineMap.set(markerId, neutralized);
                return ` data-v12-style="${markerId}"`;
            });

            // 3. Parse DOM
            const parser = new DOMParser();
            let doc = parser.parseFromString(currentContent, 'image/svg+xml');
            let svg = doc.querySelector('svg');
            if (!svg || doc.querySelector('parsererror')) {
                doc = parser.parseFromString(currentContent, 'text/html');
                svg = doc.querySelector('svg');
            }
            if (!svg) throw new Error('V12-FAIL');

            // 4. Brand Intelligence
            let isBrandIcon = false;

            // Scan inline styles
            inlineMap.forEach((styleStr) => {
                styleStr.split(';').forEach(pair => {
                    const val = pair.split(':')[1]?.trim();
                    if (val && isVibrant(val)) isBrandIcon = true;
                });
            });

            // Scan extracted rules
            extractedRules.forEach(r => r.declarations.forEach((d: string) => {
                const val = d.split(':')[1]?.trim();
                if (val && isVibrant(val)) isBrandIcon = true;
            }));

            // Scan element attributes
            svg.querySelectorAll('*').forEach(el => {
                ['fill', 'stroke', 'stop-color', 'color'].forEach(a => {
                    const v = el.getAttribute(a);
                    if (v && isVibrant(v)) isBrandIcon = true;
                });
            });

            const currentTheme = (theme || 'dark').toLowerCase();
            const touchedElements = new Set<Element>();

            // 5. Force root inheritance
            svg.removeAttribute('color');

            // 6. Apply Inlines (Neutralized)
            svg.querySelectorAll('[data-v12-style]').forEach(el => {
                const sval = inlineMap.get(el.getAttribute('data-v12-style') || '');
                if (sval) {
                    sval.split(';').forEach(p => {
                        const [k, v] = p.split(':').map(x => x?.trim());
                        if (k && v && styleToAttrMap[k.toLowerCase()]) {
                            el.setAttribute(styleToAttrMap[k.toLowerCase()], v);
                            if (['fill', 'stroke', 'color'].includes(k.toLowerCase())) touchedElements.add(el);
                        }
                    });
                }
                el.removeAttribute('data-v12-style');
            });

            // 7. Apply CSS Rules (Neutralized)
            ['all', currentTheme].forEach(mode => {
                extractedRules.filter(r => r.themeMode === mode).forEach(rule => {
                    const selector = rule.selector.replace(/^svg\s+/i, '') || 'svg';
                    try {
                        const targets = svg!.matches(selector) ? [svg!, ...Array.from(svg!.querySelectorAll(selector))] : Array.from(svg!.querySelectorAll(selector));
                        targets.forEach(el => {
                            rule.declarations.forEach((d: string) => {
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

            // 8. Adaptive Inversion Policy
            const isDark = currentTheme === 'dark';
            const allNodes = [svg, ...Array.from(svg.querySelectorAll('*'))];
            allNodes.forEach(el => {
                const tag = el.tagName.toLowerCase();
                if (['path', 'circle', 'rect', 'ellipse', 'polygon', 'polyline', 'text', 'line'].includes(tag)) {
                    const fill = el.getAttribute('fill');
                    const stroke = el.getAttribute('stroke');

                    if (isDark && !isBrandIcon) {
                        const isDarkFill = fill && isNearBlack(fill);
                        const isDarkStroke = stroke && isNearBlack(stroke);
                        const isCurrentColor = fill === 'currentColor' || stroke === 'currentColor';
                        const isInherit = fill === 'inherit' || stroke === 'inherit';

                        if ((isDarkFill || isDarkStroke || isCurrentColor || isInherit) && !touchedElements.has(el)) {
                            if (isDarkFill || isCurrentColor || isInherit || !fill) el.setAttribute('fill', 'currentColor');
                            if (isDarkStroke || isCurrentColor || isInherit) el.setAttribute('stroke', 'currentColor');
                        }
                    }

                    // Fallback for zero-color shapes
                    if (!el.hasAttribute('fill') && !el.hasAttribute('stroke') && !touchedElements.has(el)) {
                        let inherited = false;
                        let p = el.parentElement;
                        while (p && p !== svg!.parentElement) {
                            if (p.hasAttribute('fill') || p.hasAttribute('stroke')) { inherited = true; break; }
                            p = p.parentElement;
                        }
                        if (!inherited && !isBrandIcon) el.setAttribute('fill', 'currentColor');
                    }
                }

                // Internal Namespacing
                const id = el.getAttribute('id'); if (id) el.setAttribute('id', `${prefix}${id}`);
                const cls = el.getAttribute('class'); if (cls) el.setAttribute('class', cls.split(/\s+/).map(c => `${prefix}${c}`).join(' '));
            });

            // 9. Restore Dynamic Links
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
            svg.setAttribute('data-provenance', `v12-${Date.now()}`);
            const output = new XMLSerializer().serializeToString(svg);

            if (process.env.NODE_ENV === 'development') {
                if (isBrandIcon) console.warn(`[InlinedSvg V12] 🌈 ${src} - BRAND PROTECTED (Vibrant Detected)`);
                else console.info(`[InlinedSvg V12] 👤 ${src} - MONOCHROME (Sensing Enabled)`);
            }

            setSvgContent(output);
        } catch (err) {
            console.error('[InlinedSvg V12] Fault:', err);
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
