'use client';

import Link from 'next/link';
import { LogIn, Search, ShieldCheck } from 'lucide-react';
import { signOut, useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import ThemeToggle from './ThemeToggle';
import { useTheme } from './ThemeProvider';

export default function TopNav() {
  const { data: session } = useSession();
  const user = session?.user;
  const roles = user?.roles ?? [];
  const isAuthenticated = Boolean(user);
  const { theme } = useTheme();
  const [searchValue, setSearchValue] = useState('');

  const toggleHeadings = () => {
    try {
      const stored = window.localStorage.getItem('techhub-portal-headings');
      const next = stored === 'off' ? 'on' : 'off';
      window.localStorage.setItem('techhub-portal-headings', next);
      window.dispatchEvent(new CustomEvent('techhub-headings', { detail: next }));
    } catch {
      window.dispatchEvent(new CustomEvent('techhub-headings', { detail: 'on' }));
    }
  };

  const handleSearch = (value: string) => {
    setSearchValue(value);
    try {
      window.localStorage.setItem('techhub-portal-search', value);
      window.dispatchEvent(new CustomEvent('techhub-search', { detail: value }));
    } catch {
      window.dispatchEvent(new CustomEvent('techhub-search', { detail: value }));
    }
  };

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('techhub-portal-search');
      if (stored) {
        setSearchValue(stored);
      }
    } catch {
      setSearchValue('');
    }
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail ?? '';
      setSearchValue(detail);
    };
    window.addEventListener('techhub-search', handler);
    return () => window.removeEventListener('techhub-search', handler);
  }, []);

  return (
    <header className="px-6 md:px-12 pt-6">
      <div className="glass rounded-3xl px-6 py-4 flex items-center justify-between shadow-glow">
        <div className="flex items-center gap-3">
          <div className="h-10 w-24">
            <img
              src={theme === 'dark' ? '/capita-logo-dark.png' : '/capita-logo.png'}
              alt="Capita logo"
              className="h-full w-full object-contain"
            />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-ink-300">TechHub</p>
            <p className="font-serif text-lg">Launch point for platforms, tools, and environments</p>
          </div>
        </div>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/" className="text-ink-200 hover:text-white transition">
            Portal
          </Link>
          <Link href="/admin" className="text-ink-200 hover:text-white transition">
            Admin
          </Link>
          <div className="hidden md:flex items-center gap-2 rounded-full border border-ink-600 px-3 py-2 text-ink-100">
            <Search size={16} className="text-ink-300" />
            <input
              type="search"
              placeholder="Search apps"
              value={searchValue}
              onChange={(event) => handleSearch(event.target.value)}
              className="bg-transparent text-xs text-ink-100 placeholder:text-ink-400 focus:outline-none"
              aria-label="Search apps"
            />
          </div>
          <ThemeToggle />
          {isAuthenticated ? (
            <button
              type="button"
              onClick={toggleHeadings}
              className="rounded-full border border-ink-600 px-4 py-2 text-xs text-ink-200 hover:border-ink-300 transition"
            >
              Toggle headings
            </button>
          ) : null}
          {user ? (
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: '/auth/signin' })}
              className="flex items-center gap-2 rounded-full border border-ink-600 px-4 py-2 text-ink-100 hover:border-ink-300 transition"
            >
              <ShieldCheck size={16} />
              {roles.includes('admin') ? 'Admin session' : user.name ?? 'Signed in'}
            </button>
          ) : (
            <Link
              href="/auth/signin"
              className="flex items-center gap-2 rounded-full border border-ink-600 px-4 py-2 text-ink-100 hover:border-ink-300 transition"
            >
              <LogIn size={16} />
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
