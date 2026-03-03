'use client';

import { SessionProvider } from 'next-auth/react';
import { ThemeProvider } from './ThemeProvider';
import { CsrfProvider } from './CsrfProvider';

export default function Providers({
  children,
  csrfToken
}: {
  children: React.ReactNode;
  csrfToken: string;
}) {
  return (
    <SessionProvider
      refetchInterval={0}
      refetchOnWindowFocus={false}
    >
      <CsrfProvider token={csrfToken}>
        <ThemeProvider>{children}</ThemeProvider>
      </CsrfProvider>
    </SessionProvider>
  );
}
