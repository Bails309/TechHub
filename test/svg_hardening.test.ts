import { describe, it, expect } from 'vitest';
import sanitizeHtml from 'sanitize-html';

// Standalone mirror of the logic in src/lib/storage.ts (v11.2 Hardened)
function sanitizeSvg(svgContent: string): string {
    return sanitizeHtml(svgContent, {
        allowedTags: [
            'svg', 'g', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse',
            'defs', 'clipPath', 'clip-path', 'mask', 'use', 'image', 'text', 'tspan',
            'symbol', 'title', 'desc', 'style', 'pattern', 'marker', 'metadata',
            'linearGradient', 'radialGradient', 'stop', 'filter', 'feGaussianBlur',
            'feOffset', 'feMerge', 'feMergeNode', 'feColorMatrix', 'feComponentTransfer',
            'feFuncR', 'feFuncG', 'feFuncB', 'feFuncA', 'feComposite', 'feFlood'
        ],
        allowedAttributes: {
            '*': [
                'id', 'class', 'viewBox', 'width', 'height', 'fill', 'stroke',
                'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'd', 'cx', 'cy', 'r',
                'x', 'y', 'x1', 'y1', 'x2', 'y2', 'points', 'transform', 'opacity',
                'offset', 'stop-color', 'stop-opacity', 'stdDeviation', 'in', 'result',
                'mode', 'values', 'type', 'operator', 'k1', 'k2', 'k3', 'k4', 'clip-path',
                'mask', 'href', 'xlink:href',
                'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline', 'color',
                'style', 'fill-rule', 'clip-rule', 'stroke-opacity', 'fill-opacity',
                'filterUnits', 'gradientUnits', 'gradientTransform', 'spreadMethod',
                'patternUnits', 'patternContentUnits', 'patternTransform', 'preserveAspectRatio',
                'markerWidth', 'markerHeight', 'refX', 'refY', 'orient', 'markerUnits',
                'rx', 'ry', 'stroke-dasharray', 'stroke-dashoffset', 'vector-effect'
            ],
            'svg': ['xmlns', 'xmlns:xlink', 'version'],
        },
        parser: {
            lowerCaseTags: false,
            lowerCaseAttributeNames: false,
        },
        allowVulnerableTags: true,
        allowedSchemes: ['http', 'https', 'data'],
        allowedSchemesByTag: {
            image: ['http', 'https', 'data'],
            use: ['http', 'https', 'data'],
            '*': ['http', 'https', 'data']
        },
        transformTags: {
            '*': (tagName: string, attribs: any) => {
                ['href', 'xlink:href'].forEach(attr => {
                    if (attribs[attr]) {
                        const val = attribs[attr].trim().toLowerCase();
                        if (val.startsWith('javascript:') || val.startsWith('vbscript:') || val.startsWith('data:text/html')) {
                            delete attribs[attr];
                        }
                    }
                });
                return { tagName, attribs };
            }
        }
    });
}

describe('SVG Hardening & Compliance (Final Hardened Rules)', () => {

    it('removes <script> tags from SVG', () => {
        const malformed = '<svg><script>alert(1)</script><path d="M0 0h10v10H0z"/></svg>';
        const sanitized = sanitizeSvg(malformed);
        expect(sanitized).not.toContain('<script');
    });

    it('removes event handlers like onclick', () => {
        const malformed = '<svg><path onclick="alert(1)" d="M0 0h10v10H0z"/></svg>';
        const sanitized = sanitizeSvg(malformed);
        expect(sanitized).not.toContain('onclick');
    });

    it('blocks xlink:href javascript: URLs definitively', () => {
        const malformed = '<svg><image xlink:href="javascript:alert(1)" /></svg>';
        const sanitized = sanitizeSvg(malformed);
        expect(sanitized).not.toContain('javascript:');
        expect(sanitized).not.toContain('xlink:href'); // Attribute should be deleted
    });

    it('blocks href javascript: URLs definitively', () => {
        const malformed = '<svg><a href="javascript:alert(1)">link</a></svg>';
        const sanitized = sanitizeSvg(malformed);
        expect(sanitized).not.toContain('javascript:');
    });
});
