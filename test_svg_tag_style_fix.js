const sanitizeHtml = require('sanitize-html');

function sanitizeSvg(svgContent) {
    const config = {
        allowedTags: [
            'svg', 'g', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse',
            'defs', 'clipPath', 'mask', 'use', 'image', 'text', 'tspan',
            'symbol', 'title', 'desc', 'style',
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
                'filterUnits', 'gradientUnits', 'gradientTransform', 'spreadMethod'
            ],
            'svg': ['xmlns', 'xmlns:xlink', 'version'],
        },
        parser: {
            lowerCaseTags: false,
            lowerCaseAttributeNames: false,
        },
    };
    return sanitizeHtml(svgContent, config);
}

const testSvg = `
<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <style>
    .cls-1 { fill: #ff0000; }
    .cls-2 { fill: #00ff00; }
  </style>
  <circle class="cls-1" cx="50" cy="50" r="40" />
</svg>
`;

const sanitized = sanitizeSvg(testSvg);
console.log('--- SANITIZED ---');
console.log(sanitized);

if (sanitized.includes('<style>') && sanitized.includes('.cls-1')) {
    console.log('SUCCESS: Style tag and content preserved.');
} else {
    console.log('FAILURE: Style tag or content still stripped!');
    if (sanitized.includes('<style></style>')) {
        console.log('Reason: Style tag preserved but content stripped.');
    }
}
