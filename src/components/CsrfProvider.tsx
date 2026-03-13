'use client';

import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';

const CsrfContext = createContext<string>('');

export function CsrfProvider({ token, children }: { token: string; children: ReactNode }) {
  return <CsrfContext.Provider value={token}>{children}</CsrfContext.Provider>;
}

export function useCsrfToken(): string {
  const contextToken = useContext(CsrfContext);
  if (contextToken) return contextToken;

  // Fallback for first-visit race condition
  if (typeof document !== 'undefined') {
    const cookies = document.cookie.split('; ');
    const xsrfCookie = cookies.find(c => c.startsWith('XSRF-TOKEN='));
    if (xsrfCookie) return decodeURIComponent(xsrfCookie.split('=')[1]);

    const publicXsrfCookie = cookies.find(c => c.startsWith('XSRF-TOKEN-PUBLIC='));
    if (publicXsrfCookie) return decodeURIComponent(publicXsrfCookie.split('=')[1]);
  }

  return '';
}
