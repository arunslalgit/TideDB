import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Search, ChevronDown, ChevronRight } from 'lucide-react';
import { useActiveConnection } from '../../hooks/useActiveConnection';
import prometheusClient from '../../api/prometheus';
import type { Target } from '../../api/prometheus';

interface SDGroup {
  job: string;
  activeTargets: Target[];
  droppedTargets: Array<{ discoveredLabels: Record<string, string> }>;
}

export default function PromServiceDiscovery() {
  const { connection, auth } = useActiveConnection();
  const [groups, setGroups] = useState<SDGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const [showDropped, setShowDropped] = useState(false);

  const fetchTargets = useCallback(async () => {
    if (!connection || connection.type !== 'prometheus') return;
    setLoading(true);
    setError(null);
    try {
      const resp = await prometheusClient.getTargets(connection.url, 'any', auth);
      if (resp.status !== 'success') throw new Error('Failed to fetch targets');

      const active = resp.data.activeTargets || [];
      const dropped = resp.data.droppedTargets || [];

      // Group active by job
      const jobMap = new Map<string, SDGroup>();
      active.forEach((t) => {
        const job = t.scrapePool || t.labels?.job || 'unknown';
        if (!jobMap.has(job)) {
          jobMap.set(job, { job, activeTargets: [], droppedTargets: [] });
        }
        jobMap.get(job)!.activeTargets.push(t);
      });

      // Add dropped (they don't have job reliably, so group by __job_name__ discovered label)
      dropped.forEach((t) => {
        const job = t.discoveredLabels?.__job_name__ || t.discoveredLabels?.job || 'dropped';
        if (!jobMap.has(job)) {
          jobMap.set(job, { job, activeTargets: [], droppedTargets: [] });
        }
        jobMap.get(job)!.droppedTargets.push(t);
      });

      const sorted = Array.from(jobMap.values()).sort((a, b) => a.job.localeCompare(b.job));
      setGroups(sorted);
      setExpandedJobs(new Set(sorted.map((g) => g.job)));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [connection, auth]);

  useEffect(() => { fetchTargets(); }, [fetchTargets]);

  const toggleJob = (job: string) => {
    setExpandedJobs((prev) => {
      const next = new Set(prev);
      if (next.has(job)) next.delete(job); else next.add(job);
      return next;
    });
  };

  const totalActive = groups.reduce((s, g) => s + g.activeTargets.length, 0);
  const totalDropped = groups.reduce((s, g) => s + g.droppedTargets.length, 0);

  const filteredGroups = search
    ? groups.filter((g) => g.job.toLowerCase().includes(search.toLowerCase()) ||
        g.activeTargets.some((t) => t.scrapeUrl.toLowerCase().includes(search.toLowerCase())))
    : groups;

  if (!connection || connection.type !== 'prometheus') {
    return <div className="flex items-center justify-center h-full text-gray-500"><p>Select a Prometheus connection.</p></div>;
  }

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-white">Service Discovery</h1>
        <button onClick={fetchTargets} disabled={loading} className="p-2 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex gap-4 text-sm">
        <span className="text-gray-400">{totalActive} active targets</span>
        <span className="text-gray-500">{totalDropped} dropped</span>
      </div>

      <div className="flex gap-2 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-2 text-gray-500" />
          <input
            type="text"
            placeholder="Search jobs or targets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-200 text-xs placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-400">
          <input
            type="checkbox"
            checked={showDropped}
            onChange={(e) => setShowDropped(e.target.checked)}
            className="rounded border-gray-600"
          />
          Show Dropped
        </label>
      </div>

      {error && <div className="p-3 rounded bg-red-900/30 border border-red-800 text-red-300 text-sm">{error}</div>}

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
                <span className="text-xs text-gray-500">
                  {g.activeTargets.length} active
                  {g.droppedTargets.length > 0 && `, ${g.droppedTargets.length} dropped`}
                </span>
              </div>
            </button>
            {expandedJobs.has(g.job) && (
              <div className="divide-y divide-gray-800/50">
                {g.activeTargets.map((t, i) => (
                  <div key={i} className="px-4 py-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${t.health === 'up' ? 'bg-green-500' : 'bg-red-500'}`} />
                      <span className="font-mono text-xs text-gray-300">{t.scrapeUrl}</span>
                    </div>
                    <div className="pl-4 grid grid-cols-2 gap-x-6 gap-y-1">
                      <div>
                        <span className="text-[10px] text-gray-500 uppercase block">Discovered Labels</span>
                        <div className="text-xs font-mono text-gray-400 space-y-0.5">
                          {Object.entries(t.discoveredLabels || {}).map(([k, v]) => (
                            <div key={k}><span className="text-gray-500">{k}=</span>&quot;{v}&quot;</div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-500 uppercase block">Target Labels</span>
                        <div className="text-xs font-mono text-gray-400 space-y-0.5">
                          {Object.entries(t.labels || {}).map(([k, v]) => (
                            <div key={k}><span className="text-gray-500">{k}=</span>&quot;{v}&quot;</div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {showDropped && g.droppedTargets.map((t, i) => (
                  <div key={`dropped-${i}`} className="px-4 py-3 opacity-60">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-2 h-2 rounded-full flex-shrink-0 bg-gray-600" />
                      <span className="text-xs text-gray-500 font-medium">DROPPED</span>
                    </div>
                    <div className="pl-4 text-xs font-mono text-gray-500 space-y-0.5">
                      {Object.entries(t.discoveredLabels || {}).map(([k, v]) => (
                        <div key={k}><span className="text-gray-600">{k}=</span>&quot;{v}&quot;</div>
                      ))}
                    </div>
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
