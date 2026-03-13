const sanitizeHtml = require('sanitize-html');

function sanitizeSvg(svgContent) {
    const config = {
        allowedTags: [
            'svg', 'g', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse',
            'defs', 'clipPath', 'mask', 'use', 'image', 'text', 'tspan',
            'symbol', 'title', 'desc',
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
  <defs>
    <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:rgb(255,255,0);stop-opacity:1" />
      <stop offset="100%" style="stop-color:rgb(255,0,0);stop-opacity:1" />
    </linearGradient>
  </defs>
  <circle cx="50" cy="50" r="40" stroke="green" stroke-width="4" fill="url(#grad1)" style="opacity:0.5;fill:red" />
  <path d="M10 10 L90 90" style="stroke: blue; stroke-width: 2" />
</svg>
`;

const sanitized = sanitizeSvg(testSvg);
console.log('--- SANITIZED ---');
console.log(sanitized);

const hasStyleContent = sanitized.includes('style="stop-color:rgb(255,255,0);stop-opacity:1"') ||
    sanitized.includes('style="opacity:0.5;fill:red"') ||
    sanitized.includes('style="stroke: blue; stroke-width: 2"');

if (hasStyleContent) {
    console.log('SUCCESS: Style content preserved.');
} else {
    console.log('FAILURE: Style content stripped!');
    if (sanitized.includes('style=""')) {
        console.log('Reason: style attribute exists but is empty.');
    }
}
