import { describe, it, expect } from 'vitest';
import { chooseLogo, DEFAULT_LOGO, DEFAULT_LOGO_DARK } from '../src/lib/siteConfig';

describe('chooseLogo', () => {
    it('returns logoDark in dark theme', () => {
        expect(chooseLogo('dark', { logoDark: '/dark.svg', logoLight: '/light.svg', logo: '/logo.svg' }))
            .toBe('/dark.svg');
    });

    it('falls back to logo when logoDark is missing in dark theme', () => {
        expect(chooseLogo('dark', { logo: '/logo.svg', logoLight: '/light.svg' }))
            .toBe('/logo.svg');
    });

    it('falls back to DEFAULT_LOGO_DARK when nothing provided in dark theme', () => {
        expect(chooseLogo('dark', {})).toBe(DEFAULT_LOGO_DARK);
    });

    it('returns logoLight in light theme', () => {
        expect(chooseLogo('light', { logoLight: '/light.svg', logoDark: '/dark.svg', logo: '/logo.svg' }))
            .toBe('/light.svg');
    });

    it('falls back to logo when logoLight is missing in light theme', () => {
        expect(chooseLogo('light', { logo: '/logo.svg', logoDark: '/dark.svg' }))
            .toBe('/logo.svg');
    });

    it('falls back to DEFAULT_LOGO when nothing provided in light theme', () => {
        expect(chooseLogo('light', {})).toBe(DEFAULT_LOGO);
    });

    it('returns light-mode defaults when theme is undefined', () => {
        expect(chooseLogo(undefined, { logoLight: '/light.svg' })).toBe('/light.svg');
    });

    it('returns logo fallback when theme is undefined and no mode-specific one', () => {
        expect(chooseLogo(undefined, { logo: '/logo.svg' })).toBe('/logo.svg');
    });
});
