import type { Metadata } from 'next';
import Script from 'next/script';
import { headers } from 'next/headers';
import './globals.css';
import SideNav from '../components/SideNav';
import PageHeader from '../components/PageHeader';
import Providers from '../components/Providers';
import SessionGuard from '../components/SessionGuard';

export const metadata: Metadata = {
  title: 'TechHub',
  description: 'Your modern gateway to every app your team depends on.'
};

export default async function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const headerList = await headers();
  const nonce = headerList.get('x-nonce') ?? undefined;

  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <Script src="/theme-init.js" strategy="beforeInteractive" nonce={nonce} />
      </head>
      <body>
        <Providers>
          <div className="flex min-h-screen">
            <SideNav />
            <div className="flex-1 flex flex-col min-w-0 md:pl-20 lg:pl-64 transition-all duration-300">
              <PageHeader />
              <main className="flex-1 pb-12">{children}</main>
            </div>
          </div>
          <SessionGuard />
        </Providers>
      </body>
    </html>
  );
}
