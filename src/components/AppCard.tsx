import Link from 'next/link';
import { LayoutGrid } from 'lucide-react';
import { useState, useMemo } from 'react';
import { sanitizeIconUrl } from '../lib/sanitizeIconUrl';

export interface AppCardProps {
  app: {
    id: string;
    name: string;
    url: string;
    description?: string | null;
    category?: string | null;
    icon?: string | null;
  };
  onReorder: (fromId: string, toId: string, contextIds?: string[]) => void;
  contextIds?: string[];
}

export default function AppCard({ app, onReorder, contextIds }: AppCardProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [iconError, setIconError] = useState(false);
  const safeIcon = useMemo(() => sanitizeIconUrl(app.icon), [app.icon]);

  const handleDragStart = (event: React.DragEvent<HTMLAnchorElement>) => {
    event.dataTransfer.setData('text/plain', app.id);
    event.dataTransfer.effectAllowed = 'move';
    setIsDragging(true);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const handleDragOver = (event: React.DragEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (event: React.DragEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const fromId = event.dataTransfer.getData('text/plain');
    if (!fromId || fromId === app.id) {
      return;
    }
    onReorder(fromId, app.id, contextIds);
  };

  return (
    <Link
      href={`/api/launch/${app.id}`}
      target="_blank"
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`glass group relative flex flex-col items-center justify-center gap-4 rounded-3xl p-6 transition-all hover:-translate-y-1 hover:shadow-glow hover:z-10 focus:outline-none focus:ring-2 focus:ring-ocean-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-ink-900 ${isDragging ? 'opacity-50 scale-95' : ''
        }`}
      prefetch={false}
      title={app.description ?? app.name}
    >
      <div className="h-16 w-16 md:h-20 md:w-20 rounded-2xl bg-white/5 flex items-center justify-center transition-transform group-hover:scale-110">
        {safeIcon && !iconError ? (
          <img
            src={safeIcon}
            alt=""
            className="h-12 w-12 md:h-14 md:w-14 object-contain"
            onError={() => setIconError(true)}
            draggable={false}
          />
        ) : (
          <LayoutGrid className="h-8 w-8 md:h-10 md:w-10 text-ink-300" />
        )}
      </div>
      <div className="text-center w-full">
        <h3 className="truncate font-serif text-base md:text-lg font-medium tracking-tight text-ink-50 group-hover:text-white transition-colors">
          {app.name}
        </h3>
        {app.category && (
          <p className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity truncate text-xs uppercase tracking-wider text-ink-300">
            {app.category}
          </p>
        )}
      </div>
    </Link>
  );
}
