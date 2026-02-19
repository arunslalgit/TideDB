import { useState, useEffect, useCallback } from 'react';
import { Search, RefreshCw, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useActiveConnection } from '../../hooks/useActiveConnection';
import prometheusClient from '../../api/prometheus';
interface MetricEntry {
  name: string;
  type: string;
  help: string;
  unit: string;
}

const TYPE_COLORS: Record<string, string> = {
  counter: 'bg-blue-900/50 text-blue-400',
  gauge: 'bg-green-900/50 text-green-400',
  histogram: 'bg-purple-900/50 text-purple-400',
  summary: 'bg-yellow-900/50 text-yellow-400',
  unknown: 'bg-gray-800 text-gray-400',
  untyped: 'bg-gray-800 text-gray-400',
};

export default function PromMetrics() {
  const { connection, auth } = useActiveConnection();
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<MetricEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const fetchMetrics = useCallback(async () => {
    if (!connection || connection.type !== 'prometheus') return;
    setLoading(true);
    setError(null);
    try {
      const resp = await prometheusClient.getMetadata(connection.url, auth);
      if (resp.status !== 'success') throw new Error('Failed to fetch metadata');

      const entries: MetricEntry[] = [];
      for (const [name, metas] of Object.entries(resp.data)) {
        const meta = metas[0]; // take first
        entries.push({
          name,
          type: meta?.type || 'unknown',
          help: meta?.help || '',
          unit: meta?.unit || '',
        });
      }
      entries.sort((a, b) => a.name.localeCompare(b.name));
      setMetrics(entries);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [connection, auth]);

  useEffect(() => { fetchMetrics(); }, [fetchMetrics]);

  const types = ['all', ...new Set(metrics.map((m) => m.type))];

  const filtered = metrics.filter((m) => {
    if (typeFilter !== 'all' && m.type !== typeFilter) return false;
    if (search && !m.name.toLowerCase().includes(search.toLowerCase()) && !m.help.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const openInQuery = (metricName: string) => {
    navigate('/prometheus/query');
    // Store the metric to auto-fill in query explorer
    sessionStorage.setItem('tsui_prom_query_prefill', metricName);
  };

  if (!connection || connection.type !== 'prometheus') {
    return <div className="flex items-center justify-center h-full text-gray-500"><p>Select a Prometheus connection.</p></div>;
  }

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-white">Metric Explorer</h1>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{filtered.length} of {metrics.length} metrics</span>
          <button onClick={fetchMetrics} disabled={loading} className="p-2 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 items-center flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-2.5 top-2 text-gray-500" />
          <input
            type="text"
            placeholder="Search metrics..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-200 text-xs placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="flex gap-1">
          {types.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1 rounded text-xs capitalize ${
                typeFilter === t ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="p-3 rounded bg-red-900/30 border border-red-800 text-red-300 text-sm">{error}</div>}

      {/* Metric list */}
      <div className="space-y-2">
        {filtered.slice(0, 200).map((m) => (
          <div key={m.name} className="rounded-lg border border-gray-800 p-3 hover:bg-gray-900/50 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-sm text-gray-200 font-medium">{m.name}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${TYPE_COLORS[m.type] || TYPE_COLORS.unknown}`}>
                {m.type}
              </span>
              {m.unit && <span className="text-[10px] text-gray-500">({m.unit})</span>}
            </div>
            {m.help && <p className="text-xs text-gray-500 mb-2">{m.help}</p>}
            <button
              onClick={() => openInQuery(m.name)}
              className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              <ExternalLink size={10} />
              Query
            </button>
          </div>
        ))}
        {filtered.length > 200 && (
          <p className="text-xs text-gray-500 text-center py-2">Showing 200 of {filtered.length} metrics. Use search to narrow results.</p>
        )}
      </div>

      {!loading && filtered.length === 0 && !error && (
        <div className="text-center py-12 text-gray-500 text-sm">No metrics found</div>
      )}
    </div>
  );
}
