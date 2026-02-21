import Link from 'next/link';
import { ExternalLink, LayoutGrid } from 'lucide-react';
import { useState } from 'react';

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

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData('text/plain', app.id);
    event.dataTransfer.effectAllowed = 'move';
    setIsDragging(true);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const fromId = event.dataTransfer.getData('text/plain');
    if (!fromId || fromId === app.id) {
      return;
    }
    onReorder(fromId, app.id, contextIds);
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`glass rounded-3xl p-5 flex flex-col gap-3 hover:shadow-glow transition ${
        isDragging ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-ink-300">
            {app.category ?? 'App'}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-white/10 flex items-center justify-center">
              {app.icon && !iconError ? (
                <img
                  src={app.icon}
                  alt=""
                  className="h-8 w-8 object-contain"
                  onError={() => setIconError(true)}
                />
              ) : (
                <LayoutGrid size={18} className="text-ink-200" />
              )}
            </div>
            <h3 className="text-lg font-serif">{app.name}</h3>
          </div>
        </div>
        <ExternalLink className="text-ink-400" size={18} />
      </div>
      {app.description ? (
        <p className="text-sm text-ink-200 leading-relaxed">{app.description}</p>
      ) : null}
      <Link
        href={app.url}
        target="_blank"
        className="launch-button mt-auto inline-flex items-center justify-between rounded-2xl px-4 py-2 text-sm transition"
        draggable={false}
      >
        Launch
        <span className="text-ink-400">↗</span>
      </Link>
    </div>
  );
}
