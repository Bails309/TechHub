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

function reorderSubset(order: string[], subset: string[], nextSubset: string[]) {
  const subsetSet = new Set(subset);
  let idx = 0;
  return order.map((id) => (subsetSet.has(id) ? nextSubset[idx++] : id));
}

export default function PortalView({ apps, isAuthenticated, initialOrder }: PortalViewProps) {
  const [order, setOrder] = useState(() => normaliseOrder(initialOrder, apps));
  const [headingsOn, setHeadingsOn] = useState(true);
  const [query, setQuery] = useState('');

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
    if (!isAuthenticated) {
      return;
    }
    try {
      const stored = window.localStorage.getItem('techhub-portal-headings');
      if (stored === 'off') {
        setHeadingsOn(false);
      }
    } catch {
      setHeadingsOn(true);
    }
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      setHeadingsOn(detail !== 'off');
    };
    window.addEventListener('techhub-headings', handler);
    return () => window.removeEventListener('techhub-headings', handler);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    try {
      window.localStorage.setItem('techhub-portal-headings', headingsOn ? 'on' : 'off');
    } catch {
      // ignore
    }
  }, [headingsOn, isAuthenticated]);

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
    };
    window.addEventListener('techhub-search', handler);
    return () => window.removeEventListener('techhub-search', handler);
  }, []);

  const orderedApps = useMemo(() => sortApps(apps, order), [apps, order]);

  const filteredApps = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return orderedApps;
    }
    return orderedApps.filter((app) => {
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
  }, [orderedApps, query]);

  const grouped = useMemo(() => {
    return filteredApps.reduce<Record<string, PortalApp[]>>((acc, app) => {
      const key = app.category ?? 'General';
      acc[key] = acc[key] ?? [];
      acc[key].push(app);
      return acc;
    }, {});
  }, [filteredApps]);

  const categories = useMemo(() => Object.keys(grouped), [grouped]);

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
    if (contextIds) {
      const subset = contextIds;
      const nextSubset = subset.filter((id) => id !== fromId);
      const targetIndex = subset.indexOf(toId);
      nextSubset.splice(targetIndex, 0, fromId);
      return persistOrder(reorderSubset(normalised, subset, nextSubset));
    }
    return persistOrder(next);
  };

  const renderGrid = (list: PortalApp[], contextIds?: string[]) => (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
    <div className="space-y-12">
      {headingsOn ? (
        <div className="space-y-12">
          {categories.map((category) => (
            <section key={category} className="space-y-6">
              <div className="flex items-center gap-4">
                <span className="h-px flex-1 bg-ink-800" />
                <h2 className="font-serif text-2xl">{category}</h2>
                <span className="h-px flex-1 bg-ink-800" />
              </div>
              {renderGrid(grouped[category], grouped[category].map((app) => app.id))}
            </section>
          ))}
        </div>
      ) : (
        renderGrid(filteredApps)
      )}
    </div>
  );
}
