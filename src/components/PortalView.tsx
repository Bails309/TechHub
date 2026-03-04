'use client';

import { useEffect, useMemo, useState } from 'react';
import AppCard from './AppCard';
import CommandPalette from './CommandPalette';
import { useCsrfToken } from './CsrfProvider';

interface PortalApp {
  id: string;
  name: string;
  url: string;
  description?: string | null;
  category?: string | null;
  icon?: string | null;
  isPersonal?: boolean;
}

interface PortalViewProps {
  apps: PortalApp[];
  isAuthenticated: boolean;
  initialOrder: string[];
  pinnedApps?: string[];
}

function normaliseOrder(order: string[], apps: PortalApp[]) {
  const appIds = apps.map((app) => app.id);
  const orderSet = new Set(order);
  const missing = appIds.filter((id) => !orderSet.has(id));
  return [...order.filter((id) => appIds.includes(id)), ...missing];
}

function sortApps(apps: PortalApp[], order: string[]) {
  const orderIndex = new Map(order.map((id, index) => [id, index]));
  return [...apps].sort((a, b) => {
    const aIndex = orderIndex.get(a.id);
    const bIndex = orderIndex.get(b.id);
    if (aIndex !== undefined && bIndex !== undefined) {
      return aIndex - bIndex;
    }
    if (aIndex !== undefined) {
      return -1;
    }
    if (bIndex !== undefined) {
      return 1;
    }
    return a.name.localeCompare(b.name);
  });
}

function moveInOrder(order: string[], fromId: string, toId: string) {
  const next = [...order];
  const fromIndex = next.indexOf(fromId);
  const toIndex = next.indexOf(toId);
  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
    return order;
  }
  next.splice(fromIndex, 1);
  next.splice(toIndex, 0, fromId);
  return next;
}

export default function PortalView({ apps, isAuthenticated, initialOrder, pinnedApps }: PortalViewProps) {
  const [order, setOrder] = useState(() => normaliseOrder(initialOrder, apps));
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [pinnedAppIds, setPinnedAppIds] = useState<string[]>(pinnedApps ?? []);
  const csrfToken = useCsrfToken();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    // If user searches via TopNav, reset category filter to 'All'
    const handleSearch = (e: CustomEvent) => {
      setQuery(e.detail);
      setSelectedCategory('All');
    };
    window.addEventListener('techhub-search', handleSearch as EventListener);
    return () => {
      window.removeEventListener('techhub-search', handleSearch as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      try {
        const storedOrder = window.localStorage.getItem('techhub-portal-order');
        if (storedOrder) {
          const parsedOrder = JSON.parse(storedOrder) as string[];
          setOrder((current) => normaliseOrder(parsedOrder, apps));
        }
      } catch {
        setOrder((current) => normaliseOrder(current, apps));
      }

      try {
        const storedPins = window.localStorage.getItem('techhub-portal-pins');
        if (storedPins) {
          const parsedPins = JSON.parse(storedPins) as string[];
          setPinnedAppIds(parsedPins);
        }
      } catch {
        // use default
      }
    }
  }, [apps, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      try {
        window.localStorage.setItem('techhub-portal-order', JSON.stringify(order));
      } catch {
        // ignore
      }
    }
  }, [order, isAuthenticated]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('techhub-portal-search');
      if (stored) {
        setQuery(stored);
      }
    } catch {
      setQuery('');
    }
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      setQuery(detail ?? '');
      if (detail) {
        setSelectedCategory('All'); // Reset category when searching
      }
    };
    window.addEventListener('techhub-search', handler);
    return () => window.removeEventListener('techhub-search', handler);
  }, []);

  const orderedApps = useMemo(() => sortApps(apps, order), [apps, order]);

  // Extract all unique categories present in the system, ignoring the search query
  const allCategories = useMemo(() => {
    const cats = new Set(orderedApps.map(app => app.category ?? 'General'));
    return Array.from(cats).sort();
  }, [orderedApps]);

  const filteredApps = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    let result = orderedApps;

    if (trimmed) {
      result = result.filter((app) => {
        const haystack = [
          app.name,
          app.category ?? '',
          app.description ?? '',
          app.url
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(trimmed);
      });
    }

    if (!trimmed && selectedCategory !== 'All') {
      result = result.filter(app => (app.category ?? 'General') === selectedCategory);
    }

    return result;
  }, [orderedApps, query, selectedCategory]);

  const togglePin = async (appId: string) => {
    const nextPins = pinnedAppIds.includes(appId)
      ? pinnedAppIds.filter((id) => id !== appId)
      : [...pinnedAppIds, appId];

    setPinnedAppIds(nextPins);

    if (isAuthenticated) {
      const { toggleFavoriteApp } = await import('../app/actions/favoriteApps');
      const payload = new FormData();
      payload.set('appId', appId);
      payload.set('csrfToken', csrfToken);
      await toggleFavoriteApp(payload);
    } else {
      window.localStorage.setItem('techhub-portal-pins', JSON.stringify(nextPins));
    }
  };

  const persistOrder = async (nextOrder: string[]) => {
    setOrder(nextOrder);
    if (!isAuthenticated) {
      return;
    }
    await fetch('/api/app-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken
      },
      body: JSON.stringify({ order: nextOrder })
    });
  };

  const handleReorder = (fromId: string, toId: string, contextIds?: string[]) => {
    const normalised = normaliseOrder(order, apps);
    const next = moveInOrder(normalised, fromId, toId);
    if (contextIds && contextIds.length > 0) {
      const base = normaliseOrder(order, apps);
      const baseWithoutFrom = base.filter((id) => id !== fromId);

      const subset = contextIds.filter((id) => baseWithoutFrom.includes(id));
      const targetIndex = subset.indexOf(toId);

      if (targetIndex === -1) {
        return persistOrder(next);
      }

      const nextSubset = [...subset];
      nextSubset.splice(targetIndex, 0, fromId);

      const subsetSet = new Set(subset);
      const firstIndex = baseWithoutFrom.findIndex((id) => subsetSet.has(id));
      if (firstIndex === -1) {
        return persistOrder(next);
      }

      const rebuilt = [
        ...baseWithoutFrom.slice(0, firstIndex),
        ...nextSubset,
        ...baseWithoutFrom.slice(firstIndex + subset.length)
      ];

      return persistOrder(rebuilt);
    }
    return persistOrder(next);
  };

  const renderGrid = (list: PortalApp[], contextIds?: string[]) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6 animate-in fade-in zoom-in-95 duration-200">
      {list.map((app) => (
        <AppCard
          key={app.id}
          app={app}
          onReorder={handleReorder}
          contextIds={contextIds}
          isPinned={pinnedAppIds.includes(app.id)}
          onTogglePin={togglePin}
        />
      ))}
    </div>
  );

  const pinnedItems = filteredApps.filter((app) => pinnedAppIds.includes(app.id));
  const unpinnedItems = filteredApps.filter((app) => !pinnedAppIds.includes(app.id));

  return (
    <div className="space-y-8">
      {!query && allCategories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-8 animate-in fade-in slide-in-from-top-4">
          <button
            onClick={() => setSelectedCategory('All')}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${selectedCategory === 'All'
              ? 'bg-ocean-600 !text-white dark:bg-ocean-500/20 border border-transparent dark:border-ocean-500/40 shadow-sm'
              : 'bg-transparent text-ink-600 dark:text-ink-300 hover:text-ink-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 border border-transparent'
              }`}
          >
            All Apps
          </button>
          {allCategories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${selectedCategory === category
                ? 'bg-ocean-600 !text-white dark:bg-ocean-500/20 border border-transparent dark:border-ocean-500/40 shadow-sm'
                : 'bg-transparent text-ink-600 dark:text-ink-300 hover:text-ink-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 border border-transparent'
                }`}
            >
              {category}
            </button>
          ))}
        </div>
      )}

      {filteredApps.length === 0 ? (
        <div className="text-center py-12 text-ink-300">
          <p className="text-lg">No applications found.</p>
        </div>
      ) : (
        <div className="space-y-12">
          {pinnedItems.length > 0 && (
            <div>
              <h2 className="text-xl font-medium tracking-tight text-ink-900 dark:text-ink-100 mb-6 flex items-center gap-2">
                <span className="h-6 w-1 rounded-full bg-ocean-500"></span>
                Pinned Apps
              </h2>
              {renderGrid(pinnedItems, pinnedItems.map((app) => app.id))}
            </div>
          )}

          {unpinnedItems.length > 0 && (
            <div>
              {pinnedItems.length > 0 && (
                <h2 className="text-xl font-medium tracking-tight text-ink-900 dark:text-ink-100 mb-6 flex items-center gap-2">
                  <span className="h-6 w-1 rounded-full bg-ink-300 dark:bg-ink-700"></span>
                  All Apps
                </h2>
              )}
              {renderGrid(unpinnedItems, unpinnedItems.map((app) => app.id))}
            </div>
          )}
        </div>
      )}

      <CommandPalette
        apps={apps as any[]} // type cast to avoid strict matching issues since it only uses id, name, category, icon, url
        isOpen={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
      />
    </div>
  );
}
