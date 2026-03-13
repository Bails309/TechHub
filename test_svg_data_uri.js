const sanitizeHtml = require('sanitize-html');

function sanitizeSvg(svgContent) {
    const config = {
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
                'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline',
                'style', 'fill-rule', 'clip-rule', 'stroke-opacity', 'fill-opacity',
                'filterUnits', 'gradientUnits', 'gradientTransform', 'spreadMethod',
                'patternUnits', 'patternContentUnits', 'patternTransform', 'preserveAspectRatio',
                'markerWidth', 'markerHeight', 'refX', 'refY', 'orient', 'markerUnits'
            ],
            'svg': ['xmlns', 'xmlns:xlink', 'version'],
        },
        parser: {
            lowerCaseTags: false,
            lowerCaseAttributeNames: false,
        },
        allowVulnerableTags: true,
    };
    return sanitizeHtml(svgContent, config);
}

const testSvg = `
<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <image href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" width="100" height="100" />
</svg>
`;

const sanitized = sanitizeSvg(testSvg);
console.log('--- SANITIZED ---');
console.log(sanitized);

if (sanitized.includes('data:image/png;base64')) {
    console.log('SUCCESS: Data URI preserved.');
} else {
    console.log('FAILURE: Data URI stripped!');
}
