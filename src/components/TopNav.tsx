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
  const isLocalUser = user?.authProvider === 'credentials';
  const { theme } = useTheme();
  const [searchValue, setSearchValue] = useState('');


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
      <div className="card-panel py-4 flex flex-wrap md:flex-nowrap items-center justify-between shadow-glow gap-4 md:gap-0">
        <Link
          href="/"
          className={`flex items-center gap-3 group ${user?.mustChangePassword ? 'opacity-50 pointer-events-none' : ''}`}
          onClick={(e) => user?.mustChangePassword && e.preventDefault()}
        >
          <div className="h-10 w-24">
            <img
              src={theme === 'dark' ? '/capita-logo-dark.png' : '/capita-logo.png'}
              alt="Capita logo"
              className="h-full w-full object-contain"
            />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-ink-300 group-hover:text-white transition-colors">TechHub</p>
            <p className="font-serif text-lg">Launch point for platforms, tools, and environments</p>
          </div>
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link
            href="/"
            className={`text-ink-200 hover:text-white transition ${user?.mustChangePassword ? 'opacity-50 pointer-events-none' : ''}`}
            onClick={(e) => user?.mustChangePassword && e.preventDefault()}
          >
            Portal
          </Link>
          {roles.includes('admin') ? (
            <Link
              href="/admin"
              className={`text-ink-200 hover:text-white transition ${user?.mustChangePassword ? 'opacity-50 pointer-events-none' : ''}`}
              onClick={(e) => user?.mustChangePassword && e.preventDefault()}
            >
              Admin
            </Link>
          ) : null}
          <div className="hidden md:flex items-center gap-2 rounded-full border border-ink-600 px-3 py-2 text-ink-100">
            <Search size={16} className="text-ink-300" />
            <input
              type="search"
              placeholder="Search apps"
              value={searchValue}
              onChange={(event) => handleSearch(event.target.value)}
              disabled={user?.mustChangePassword}
              className="bg-transparent text-xs text-ink-100 placeholder:text-ink-400 focus:outline-none disabled:opacity-50"
              aria-label="Search apps"
            />
          </div>
          <ThemeToggle />

          {user ? (
            <div className="flex items-center gap-3">
              {isLocalUser ? (
                <Link
                  href="/auth/change-password"
                  className="btn-secondary btn-small"
                >
                  Change password
                </Link>
              ) : null}
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: '/auth/signin' })}
                className="btn-secondary btn-small flex items-center gap-2"
              >
                <ShieldCheck size={16} />
                Sign out
                <span className="text-ink-400 text-xs">
                  {user.name ?? user.email ?? 'Signed in'}
                </span>
              </button>
            </div>
          ) : (
            <Link
              href="/auth/signin"
              className="btn-secondary btn-small flex items-center gap-2"
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
