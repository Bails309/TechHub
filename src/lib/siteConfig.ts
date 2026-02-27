export const DEFAULT_LOGO = '/default-logo.svg';
export const DEFAULT_LOGO_DARK = '/default-logo-dark.svg';

export function chooseLogo(theme: 'dark' | 'light' | undefined, opts: { logo?: string; logoLight?: string; logoDark?: string }) {
  if (theme === 'dark') return opts.logoDark ?? opts.logo ?? DEFAULT_LOGO_DARK;
  return opts.logoLight ?? opts.logo ?? DEFAULT_LOGO;
}
