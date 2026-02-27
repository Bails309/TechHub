'use client';

import { BarChart2, TrendingUp } from 'lucide-react';

interface AnalyticsDashboardProps {
    launchStats: { name: string; count: number }[];
    activityStats: { date: string; count: number }[];
}

export default function AnalyticsDashboard({ launchStats, activityStats }: AnalyticsDashboardProps) {
    const maxLaunch = Math.max(...launchStats.map(s => s.count), 1);
    const maxActivity = Math.max(...activityStats.map(s => s.count), 1);

    return (
        <div className="grid gap-6 md:grid-cols-2">
            {/* Popular Apps Chart */}
            <section className="card-panel">
                <div className="flex items-center gap-3 mb-6">
                    <div className="rounded-full bg-ocean-500/10 p-2 text-ocean-400">
                        <BarChart2 size={20} />
                    </div>
                    <h2 className="font-serif text-2xl">Popular Apps</h2>
                </div>
                <div className="space-y-4">
                    {launchStats.map((stat, i) => (
                        <div key={i} className="space-y-1">
                            <div className="flex justify-between text-xs text-ink-300">
                                <span className="font-medium text-ink-100">{stat.name}</span>
                                <span>{stat.count} launches</span>
                            </div>
                            <div className="h-2 w-full bg-ink-900 rounded-full overflow-hidden border border-white/5">
                                <div
                                    className="h-full bg-gradient-to-r from-ocean-600 to-ocean-400 rounded-full transition-all duration-1000"
                                    style={{ width: `${(stat.count / maxLaunch) * 100}%` }}
                                />
                            </div>
                        </div>
                    ))}
                    {launchStats.length === 0 && (
                        <p className="text-xs text-ink-400 py-4 italic text-center">No launch data yet.</p>
                    )}
                </div>
            </section>

            {/* System Activity Chart */}
            <section className="card-panel">
                <div className="flex items-center gap-3 mb-6">
                    <div className="rounded-full bg-indigo-500/10 p-2 text-indigo-400">
                        <TrendingUp size={20} />
                    </div>
                    <h2 className="font-serif text-2xl">System Activity</h2>
                </div>
                <div className="flex items-end gap-1 h-32 px-2 relative border-b border-ink-800">
                    {activityStats.map((stat, i) => (
                        <div
                            key={i}
                            className="flex-1 bg-indigo-500/20 hover:bg-indigo-500/40 transition-colors rounded-t-sm group relative"
                            style={{ height: `${(stat.count / maxActivity) * 100}%` }}
                        >
                            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-ink-800 text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 border border-white/5 shadow-xl">
                                {stat.date}: {stat.count} actions
                            </div>
                        </div>
                    ))}
                    {activityStats.length === 0 && (
                        <div className="w-full flex items-center justify-center text-xs text-ink-400 italic h-full">
                            No recent activity recorded.
                        </div>
                    )}
                </div>
                <div className="flex justify-between mt-2 text-[10px] text-ink-500 px-1 uppercase tracking-widest font-medium">
                    <span>30 days ago</span>
                    <span>Today</span>
                </div>
            </section>
        </div>
    );
}
