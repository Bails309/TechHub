import { Zap, LayoutGrid } from 'lucide-react';

export default function StatsStrip({
  appCount,
  categories
}: {
  appCount: number;
  categories: number;
}) {
  const items = [
    {
      icon: LayoutGrid,
      label: 'Configured Apps',
      value: `${appCount} ${appCount === 1 ? 'app' : 'apps'} across ${categories} ${categories === 1 ? 'category' : 'categories'}`
    },
    {
      icon: Zap,
      label: 'Launch latency',
      value: '< 1s'
    }
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {items.map((item) => (
        <div
          key={item.label}
          className="glass rounded-3xl px-6 py-5 flex items-center gap-4"
        >
          <item.icon className="text-ocean-300" />
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-ink-400">{item.label}</p>
            <p className="text-lg font-semibold">{item.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
