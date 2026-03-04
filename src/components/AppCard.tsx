import Link from 'next/link';
import { LayoutGrid, Star } from 'lucide-react';
import { useState } from 'react';

export interface AppCardProps {
  app: {
    id: string;
    name: string;
    url: string;
    description?: string | null;
    category?: string | null;
    icon?: string | null;
    isPersonal?: boolean;
  };
  onReorder: (fromId: string, toId: string, contextIds?: string[]) => void;
  contextIds?: string[];
  isPinned?: boolean;
  onTogglePin?: (appId: string) => void;
}

export default function AppCard({ app, onReorder, contextIds, isPinned = false, onTogglePin }: AppCardProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [iconError, setIconError] = useState(false);

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
      href={app.isPersonal ? app.url : `/api/launch/${app.id}`}
      target="_blank"
      rel={app.isPersonal ? 'noopener noreferrer' : undefined}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`glass group relative flex flex-col items-center justify-center gap-2 rounded-2xl p-5 transition-all hover:-translate-y-1 hover:shadow-glow hover:z-10 focus:outline-none focus:ring-2 focus:ring-ocean-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-ink-900 ${isDragging ? 'opacity-50 scale-95' : ''
        }`}
      prefetch={false}
      title={app.description ?? app.name}
    >
      {/* Pin Button */}
      {onTogglePin && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onTogglePin(app.id);
          }}
          className={`absolute top-3 right-3 p-1 rounded-full transition-all focus:outline-none ${isPinned
            ? 'text-ocean-500 hover:text-ocean-600 bg-ocean-50 dark:bg-ocean-500/20 opacity-100'
            : 'text-ink-400 hover:text-ink-600 dark:hover:text-ink-200 opacity-0 group-hover:opacity-100'
            }`}
          aria-label={isPinned ? 'Unpin app' : 'Pin app'}
          title={isPinned ? 'Unpin' : 'Pin to top'}
        >
          <Star
            size={16}
            className={`transition-all ${isPinned ? 'fill-current scale-110' : 'scale-100'}`}
          />
        </button>
      )}

      <div className="h-20 w-20 md:h-24 md:w-24 rounded-2xl bg-white/5 flex items-center justify-center transition-transform group-hover:scale-110">
        {app.icon && !iconError ? (
          <img
            src={app.icon}
            alt=""
            className="h-14 w-14 md:h-16 md:w-16 object-contain"
            onError={() => setIconError(true)}
            draggable={false}
          />
        ) : (
          <LayoutGrid className="h-8 w-8 md:h-10 md:w-10 text-ink-300" />
        )}
      </div>
      <div className="text-center w-full min-h-[3rem] flex flex-col justify-center">
        <h3 className="truncate font-serif text-sm md:text-base font-semibold tracking-tight text-ink-900 dark:text-ink-50 group-hover:text-ocean-600 dark:group-hover:text-white transition-colors">
          {app.name}
        </h3>
        {app.category && (
          <p className="mt-0.5 absolute bottom-4 left-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity truncate text-[0.65rem] uppercase tracking-wider text-ink-500 dark:text-ink-300">
            {app.isPersonal && <span className="text-emerald-400 mr-1">●</span>}
            {app.category}
          </p>
        )}
      </div>
    </Link>
  );
}
