import type { Metadata } from 'next';
import './globals.css';
import TopNav from '@/components/TopNav';
import Providers from '@/components/Providers';

export const metadata: Metadata = {
  title: 'TechHub',
  description: 'Your modern gateway to every app your team depends on.'
};

export default async function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(() => {" +
              "try {" +
              "const stored = localStorage.getItem('techhub-theme');" +
              "const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;" +
              "const theme = stored === 'light' || stored === 'dark' ? stored : (prefersLight ? 'light' : 'dark');" +
              "document.documentElement.dataset.theme = theme;" +
              "document.documentElement.style.colorScheme = theme;" +
              "} catch (_) {}" +
              "})();"
          }}
        />
      </head>
      <body>
        <Providers>
          <TopNav />
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
