'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme | undefined;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Start uninitialized to avoid reading browser APIs during SSR and causing
  // hydration mismatches. We resolve the theme on mount and then render children.
  const [theme, setTheme] = useState<Theme | undefined>(undefined);

  useEffect(() => {
    // Prefer the attribute set by theme-init.js which runs before React hydrates.
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark') {
      setTheme(attr);
      // Keep localStorage in sync
      try {
        window.localStorage.setItem('techhub-theme', attr);
      } catch {}
      document.documentElement.style.colorScheme = attr;
      return;
    }

    const stored = window.localStorage.getItem('techhub-theme');
    if (stored === 'light' || stored === 'dark') {
      setTheme(stored);
      document.documentElement.dataset.theme = stored;
      document.documentElement.style.colorScheme = stored;
      return;
    }

    const system = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    setTheme(system);
    document.documentElement.dataset.theme = system;
    document.documentElement.style.colorScheme = system;
  }, []);

  const value = useMemo(
    () => ({
      theme,
      toggleTheme: () => {
        setTheme((current) => {
          const next = current === 'dark' ? 'light' : 'dark';
          try {
            document.documentElement.dataset.theme = next;
            document.documentElement.style.colorScheme = next;
            window.localStorage.setItem('techhub-theme', next);
          } catch {}
          return next;
        });
      }
    }),
    [theme]
  );

  // Avoid rendering children until theme is resolved to prevent hydration mismatch
  if (theme === undefined) {
    return null;
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
