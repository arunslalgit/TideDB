import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Search, ChevronDown, ChevronRight } from 'lucide-react';
import { useActiveConnection } from '../../hooks/useActiveConnection';
import prometheusClient from '../../api/prometheus';
import type { Target } from '../../api/prometheus';

interface JobGroup {
  job: string;
  targets: Target[];
  upCount: number;
  downCount: number;
}

export default function PromTargets() {
  const { connection, auth } = useActiveConnection();
  const [groups, setGroups] = useState<JobGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'up' | 'down'>('all');
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const [autoRefresh, setAutoRefresh] = useState(0);

  const fetchTargets = useCallback(async () => {
    if (!connection || connection.type !== 'prometheus') return;
    setLoading(true);
    setError(null);
    try {
      const resp = await prometheusClient.getTargets(connection.url, 'any', auth);
      if (resp.status !== 'success') throw new Error('Failed to fetch targets');
      const active = resp.data.activeTargets || [];

      // Group by scrapePool (job)
      const map = new Map<string, Target[]>();
      active.forEach((t) => {
        const job = t.scrapePool || t.labels?.job || 'unknown';
        if (!map.has(job)) map.set(job, []);
        map.get(job)!.push(t);
      });

      const jobGroups: JobGroup[] = Array.from(map.entries())
        .map(([job, targets]) => ({
          job,
          targets,
          upCount: targets.filter((t) => t.health === 'up').length,
          downCount: targets.filter((t) => t.health !== 'up').length,
        }))
        .sort((a, b) => a.job.localeCompare(b.job));

      setGroups(jobGroups);
      // Auto-expand all by default
      setExpandedJobs(new Set(jobGroups.map((g) => g.job)));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [connection, auth]);

  useEffect(() => { fetchTargets(); }, [fetchTargets]);

  useEffect(() => {
    if (autoRefresh <= 0) return;
    const id = setInterval(fetchTargets, autoRefresh * 1000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchTargets]);

  const toggleJob = (job: string) => {
    setExpandedJobs((prev) => {
      const next = new Set(prev);
      if (next.has(job)) next.delete(job);
      else next.add(job);
      return next;
    });
  };

  const totalUp = groups.reduce((s, g) => s + g.upCount, 0);
  const totalDown = groups.reduce((s, g) => s + g.downCount, 0);
  const totalTargets = groups.reduce((s, g) => s + g.targets.length, 0);

  const filteredGroups = groups
    .map((g) => ({
      ...g,
      targets: g.targets.filter((t) => {
        if (statusFilter === 'up' && t.health !== 'up') return false;
        if (statusFilter === 'down' && t.health === 'up') return false;
        if (filter && !t.scrapeUrl.toLowerCase().includes(filter.toLowerCase()) &&
            !g.job.toLowerCase().includes(filter.toLowerCase())) return false;
        return true;
      }),
    }))
    .filter((g) => g.targets.length > 0);

  if (!connection || connection.type !== 'prometheus') {
    return <div className="flex items-center justify-center h-full text-gray-500"><p>Select a Prometheus connection.</p></div>;
  }

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-white">Scrape Targets</h1>
        <div className="flex items-center gap-2">
          <select
            value={autoRefresh}
            onChange={(e) => setAutoRefresh(Number(e.target.value))}
            className="px-2 py-1 rounded bg-gray-800 border border-gray-700 text-gray-300 text-xs"
          >
            <option value={0}>Auto-refresh: Off</option>
            <option value={5}>5s</option>
            <option value={10}>10s</option>
            <option value={30}>30s</option>
          </select>
          <button onClick={fetchTargets} disabled={loading} className="p-2 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="flex gap-4 text-sm">
        <span className="text-gray-400">{totalTargets} total</span>
        <span className="text-green-400">{totalUp} up</span>
        {totalDown > 0 && <span className="text-red-400">{totalDown} down</span>}
      </div>

      {/* Filters */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-2 text-gray-500" />
          <input
            type="text"
            placeholder="Filter targets..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-200 text-xs placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="flex gap-1">
          {(['all', 'up', 'down'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded text-xs capitalize ${
                statusFilter === s ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-3 rounded bg-red-900/30 border border-red-800 text-red-300 text-sm">{error}</div>
      )}

      {/* Target groups */}
      <div className="space-y-3">
        {filteredGroups.map((g) => (
          <div key={g.job} className="rounded-lg border border-gray-800 overflow-hidden">
            <button
              onClick={() => toggleJob(g.job)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-900 hover:bg-gray-800/70 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                {expandedJobs.has(g.job) ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-500" />}
                <span className="text-sm font-medium text-white">{g.job}</span>
                <span className="text-xs text-gray-500">({g.targets.length})</span>
              </div>
              <div className="flex gap-2 text-xs">
                <span className="text-green-400">{g.upCount} up</span>
                {g.downCount > 0 && <span className="text-red-400">{g.downCount} down</span>}
              </div>
            </button>
            {expandedJobs.has(g.job) && (
              <div className="divide-y divide-gray-800/50">
                {g.targets.map((t, i) => (
                  <div key={i} className="px-4 py-2.5 flex items-center gap-3 text-xs hover:bg-gray-900/50">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${t.health === 'up' ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="font-mono text-gray-300 flex-1 truncate">{t.scrapeUrl}</span>
                    <span className="text-gray-500">{(t.lastScrapeDuration * 1000).toFixed(0)}ms</span>
                    <span className="text-gray-500">{new Date(t.lastScrape).toLocaleTimeString()}</span>
                    {t.lastError && (
                      <span className="text-red-400 truncate max-w-xs" title={t.lastError}>{t.lastError}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {!loading && filteredGroups.length === 0 && !error && (
        <div className="text-center py-12 text-gray-500 text-sm">No targets found</div>
      )}
    </div>
  );
}
