'use client';

import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';

const CsrfContext = createContext<string>('');

export function CsrfProvider({ token, children }: { token: string; children: ReactNode }) {
  return <CsrfContext.Provider value={token}>{children}</CsrfContext.Provider>;
}

export function useCsrfToken(): string {
  return useContext(CsrfContext);
}
