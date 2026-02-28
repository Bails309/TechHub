import { getSystemHealth } from '@/lib/health';
import { Database, Zap, HardDrive, Server, Clock, Cpu, Activity, FileCode } from 'lucide-react';
import AutoRefresh from './AutoRefresh';
import ClientDate from '../../../components/ClientDate';

export const dynamic = 'force-dynamic';

export default async function AdminHealthPage() {
    const health = await getSystemHealth();

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'ok': return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
            case 'warning': return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
            case 'error': return 'text-rose-500 bg-rose-500/10 border-rose-500/20';
            default: return 'text-slate-500 bg-slate-500/10 border-slate-500/20';
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'ok': return 'Healthy';
            case 'warning': return 'Degraded';
            case 'error': return 'Unhealthy';
            default: return 'Unknown';
        }
    };

    return (
        <div className="p-6 md:p-12 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-bold tracking-tight">System Health</h1>
                    <p className="text-muted-foreground italic">Real-time status and diagnostics for core infrastructure.</p>
                </div>
                <AutoRefresh intervalMs={60000} />
            </div>

            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
                {/* Database Card */}
                <div className="glass rounded-3xl p-6 flex flex-col gap-4 border-white/5 shadow-xl relative overflow-hidden group">
                    <div className="flex items-center justify-between">
                        <div className="p-3 rounded-2xl bg-ocean-500/10 text-ocean-500">
                            <Database size={24} />
                        </div>
                        <div className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(health.db.status)}`}>
                            {getStatusLabel(health.db.status)}
                        </div>
                    </div>
                    <div>
                        <h3 className="text-lg font-bold">Database</h3>
                        <p className="text-sm text-muted-foreground">PostgreSQL Persistence Layer</p>
                    </div>
                    <div className="mt-auto pt-4 border-t border-white/5 flex items-center justify-between text-xs">
                        <span className="opacity-60">Latency</span>
                        <span className="font-mono">{health.db.latency ?? 'N/A'}ms</span>
                    </div>
                    {health.db.message && (
                        <p className="text-[10px] text-rose-500 mt-2 truncate" title={health.db.message}>{health.db.message}</p>
                    )}
                </div>

                {/* Redis Card */}
                <div className="glass rounded-3xl p-6 flex flex-col gap-4 border-white/5 shadow-xl relative overflow-hidden group">
                    <div className="flex items-center justify-between">
                        <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-500">
                            <Zap size={24} />
                        </div>
                        <div className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(health.redis.status)}`}>
                            {getStatusLabel(health.redis.status)}
                        </div>
                    </div>
                    <div>
                        <h3 className="text-lg font-bold">Redis Cache</h3>
                        <p className="text-sm text-muted-foreground">Distributed In-memory Store</p>
                    </div>
                    <div className="mt-auto pt-4 border-t border-white/5 space-y-3">
                        <div className="flex items-center justify-between text-xs">
                            <span className="opacity-60">Latency</span>
                            <span className="font-mono">{health.redis.latency ?? 'N/A'}ms</span>
                        </div>
                        {health.redis.details && (
                            (() => {
                                const d = health.redis.details;
                                const hasLimit = d.maxMemory > 0;
                                return (
                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between text-[10px]">
                                            <span className="opacity-60 font-medium lowercase">{hasLimit ? 'Cache Capacity' : 'Memory Usage'}</span>
                                            <span className="font-mono font-bold">{hasLimit ? `${Math.round(d.percentage)}%` : 'Unlimited'}</span>
                                        </div>
                                        {hasLimit && (
                                            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                                                <div
                                                    className={`h-full transition-all duration-500 rounded-full ${d.percentage > 90 ? 'bg-rose-500' :
                                                        d.percentage > 75 ? 'bg-amber-500' :
                                                            'bg-amber-500/50'
                                                        }`}
                                                    style={{ width: `${Math.min(100, d.percentage)}%` }}
                                                />
                                            </div>
                                        )}
                                        <div className="flex justify-between text-[9px] opacity-40 font-mono">
                                            <span>{Math.round(d.usedMemory / 1024 / 1024)}MB {hasLimit ? '' : 'Used'}</span>
                                            {hasLimit && <span>{Math.round(d.maxMemory / 1024 / 1024)}MB</span>}
                                        </div>
                                    </div>
                                );
                            })()
                        )}
                    </div>
                    {health.redis.message && (
                        <p className="text-[10px] text-amber-500 mt-2 truncate" title={health.redis.message}>{health.redis.message}</p>
                    )}
                </div>

                {/* Storage Card */}
                <div className="glass rounded-3xl p-6 flex flex-col gap-4 border-white/5 shadow-xl relative overflow-hidden group">
                    <div className="flex items-center justify-between">
                        <div className="p-3 rounded-2xl bg-purple-500/10 text-purple-500">
                            <HardDrive size={24} />
                        </div>
                        <div className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(health.storage.status)}`}>
                            {getStatusLabel(health.storage.status)}
                        </div>
                    </div>
                    <div>
                        <h3 className="text-lg font-bold">Storage</h3>
                        <p className="text-sm text-muted-foreground">Asset & Icon Persistence</p>
                    </div>
                    <div className="mt-auto pt-4 border-t border-white/5 flex flex-col gap-2">
                        <div className="flex items-center justify-between text-xs">
                            <span className="opacity-60">Provider</span>
                            <span>{health.storage.details?.provider ?? 'None'}</span>
                        </div>
                        {health.storage.details?.container && (
                            <div className="flex items-center justify-between text-[10px] opacity-60 italic">
                                <span>Container</span>
                                <span>{health.storage.details.container}</span>
                            </div>
                        )}
                        {health.storage.details?.bucket && (
                            <div className="flex items-center justify-between text-[10px] opacity-60 italic">
                                <span>Bucket</span>
                                <span>{health.storage.details.bucket}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Schema Card */}
                <div className="glass rounded-3xl p-6 flex flex-col gap-4 border-white/5 shadow-xl relative overflow-hidden group">
                    <div className="flex items-center justify-between">
                        <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-500">
                            <FileCode size={24} />
                        </div>
                        <div className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(health.schema.status)}`}>
                            {getStatusLabel(health.schema.status)}
                        </div>
                    </div>
                    <div>
                        <h3 className="text-lg font-bold">Schema</h3>
                        <p className="text-sm text-muted-foreground">Database Configuration</p>
                    </div>
                    <div className="mt-auto pt-4 border-t border-white/5 flex flex-col gap-2">
                        <div className="flex items-center justify-between text-xs">
                            <span className="opacity-60">Status</span>
                            <span className="truncate max-w-[120px]" title={health.schema.message}>{health.schema.message}</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] opacity-60">
                            <span>Code Hash</span>
                            <span className="font-mono">{health.schema.details?.currentHash}</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] opacity-60">
                            <span>DB Hash</span>
                            <span className="font-mono">{health.schema.details?.databaseHash}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <div className="glass rounded-2xl p-4 flex items-center gap-4 border-white/5">
                    <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500"><Server size={20} /></div>
                    <div>
                        <p className="text-[10px] uppercase tracking-wider opacity-60">Uptime</p>
                        <p className="text-sm font-bold font-mono">{Math.floor(health.server.uptime / 3600)}h {Math.floor((health.server.uptime % 3600) / 60)}m</p>
                    </div>
                </div>
                <div className="glass rounded-2xl p-4 flex items-center gap-4 border-white/5">
                    <div className="p-2 rounded-xl bg-orange-500/10 text-orange-500"><Cpu size={20} /></div>
                    <div>
                        <p className="text-[10px] uppercase tracking-wider opacity-60">RSS Memory</p>
                        <p className="text-sm font-bold font-mono">{Math.round(health.server.memory.rss / 1024 / 1024)}MB</p>
                    </div>
                </div>
                <div className="glass rounded-2xl p-4 flex items-center gap-4 border-white/5">
                    <div className="p-2 rounded-xl bg-pink-500/10 text-pink-500"><Clock size={20} /></div>
                    <div>
                        <p className="text-[10px] uppercase tracking-wider opacity-60">Node Version</p>
                        <p className="text-sm font-bold font-mono">{health.server.nodeVersion}</p>
                    </div>
                </div>
                <div className="glass rounded-2xl p-4 flex items-center gap-4 border-white/5">
                    <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500"><Activity size={20} /></div>
                    <div>
                        <p className="text-[10px] uppercase tracking-wider opacity-60">Environment</p>
                        <p className="text-sm font-bold uppercase">{health.server.nodeEnv ?? 'Dev'}</p>
                    </div>
                </div>
            </div>

            <div className="flex justify-end pt-4">
                <p className="text-[10px] opacity-40 italic">Last Checked: <ClientDate date={health.timestamp} /></p>
            </div>
        </div>
    );
}
