'use client';

import { useEffect, useMemo, useState } from 'react';
import AppCard from './AppCard';

interface PortalApp {
  id: string;
  name: string;
  url: string;
  description?: string | null;
  category?: string | null;
  icon?: string | null;
}

interface PortalViewProps {
  apps: PortalApp[];
  isAuthenticated: boolean;
  initialOrder: string[];
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

export default function PortalView({ apps, isAuthenticated, initialOrder }: PortalViewProps) {
  const [order, setOrder] = useState(() => normaliseOrder(initialOrder, apps));
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | 'All'>('All');

  useEffect(() => {
    if (!isAuthenticated) {
      try {
        const stored = window.localStorage.getItem('techhub-portal-order');
        if (stored) {
          const parsed = JSON.parse(stored) as string[];
          setOrder(normaliseOrder(parsed, apps));
        }
      } catch {
        setOrder((current) => normaliseOrder(current, apps));
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

  const persistOrder = async (nextOrder: string[]) => {
    setOrder(nextOrder);
    if (!isAuthenticated) {
      return;
    }
    await fetch('/api/app-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
      {list.map((app) => (
        <AppCard
          key={app.id}
          app={app}
          onReorder={handleReorder}
          contextIds={contextIds}
        />
      ))}
    </div>
  );

  return (
    <div className="space-y-8">
      {!query && allCategories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-8 animate-in fade-in slide-in-from-top-4">
          <button
            onClick={() => setSelectedCategory('All')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${selectedCategory === 'All'
                ? 'bg-ink-800 text-ocean-400 dark:bg-ocean-500/10 dark:text-ocean-300 border border-ink-300 dark:border-ocean-500/20 shadow-sm'
                : 'bg-transparent text-ink-400 hover:text-ink-100 dark:hover:bg-white/5 border border-transparent'
              }`}
          >
            All Apps
          </button>
          {allCategories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${selectedCategory === category
                  ? 'bg-ink-800 text-ocean-400 dark:bg-ocean-500/10 dark:text-ocean-300 border border-ink-300 dark:border-ocean-500/20 shadow-sm'
                  : 'bg-transparent text-ink-400 hover:text-ink-100 dark:hover:bg-white/5 border border-transparent'
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
        renderGrid(filteredApps, filteredApps.map(app => app.id))
      )}
    </div>
  );
}
