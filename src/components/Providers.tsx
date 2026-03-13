'use client';

import { SessionProvider } from 'next-auth/react';
import { ThemeProvider } from './ThemeProvider';
import { CsrfProvider } from './CsrfProvider';
import { NonceProvider } from './NonceProvider';

export default function Providers({
  children,
  csrfToken,
  nonce
}: {
  children: React.ReactNode;
  csrfToken: string;
  nonce?: string;
}) {
  return (
    <SessionProvider
      refetchInterval={0}
      refetchOnWindowFocus={false}
    >
      <CsrfProvider token={csrfToken}>
        <NonceProvider nonce={nonce}>
          <ThemeProvider>{children}</ThemeProvider>
        </NonceProvider>
      </CsrfProvider>
    </SessionProvider>
  );
}
