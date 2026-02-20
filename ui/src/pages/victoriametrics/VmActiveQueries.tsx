import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Copy, Play, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useActiveConnection } from '../../hooks/useActiveConnection';
import { getActiveQueries, getTopQueries } from '../../api/victoriametrics';
import type { ActiveQuery, TopQueryEntry } from '../../api/victoriametrics';

type TopTab = 'count' | 'avgDuration' | 'sumDuration';

export default function VmActiveQueries() {
  const { connection, auth } = useActiveConnection();
  const navigate = useNavigate();
  const [active, setActive] = useState<ActiveQuery[]>([]);
  const [topByCount, setTopByCount] = useState<TopQueryEntry[]>([]);
  const [topByAvg, setTopByAvg] = useState<TopQueryEntry[]>([]);
  const [topBySum, setTopBySum] = useState<TopQueryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topTab, setTopTab] = useState<TopTab>('count');
  const [topN, setTopN] = useState(20);
  const [maxLifetime, setMaxLifetime] = useState('30m');
  const [autoRefresh, setAutoRefresh] = useState(2);
  const [copied, setCopied] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!connection || connection.type !== 'victoriametrics') return;
    setLoading(true);
    setError(null);
    try {
      const [activeResp, topResp] = await Promise.all([
        getActiveQueries(connection.url, auth),
        getTopQueries(connection.url, topN, maxLifetime, auth),
      ]);
      setActive(activeResp);
      setTopByCount(topResp.topByCount || []);
      setTopByAvg(topResp.topByAvgDuration || []);
      setTopBySum(topResp.topBySumDuration || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [connection, auth, topN, maxLifetime]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (autoRefresh <= 0) return;
    const id = setInterval(fetchData, autoRefresh * 1000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchData]);

  const copyQuery = (q: string) => {
    navigator.clipboard.writeText(q);
    setCopied(q);
    setTimeout(() => setCopied(null), 1500);
  };

  const runInExplorer = (q: string) => {
    sessionStorage.setItem('tsui_prom_query_prefill', q);
    navigate('/victoriametrics/query');
  };

  const topData = topTab === 'count' ? topByCount : topTab === 'avgDuration' ? topByAvg : topBySum;

  if (!connection || connection.type !== 'victoriametrics') {
    return <div className="flex items-center justify-center h-full text-gray-500"><p>Select a VictoriaMetrics connection.</p></div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-white">Active & Top Queries</h1>
        <div className="flex items-center gap-2">
          <select
            value={autoRefresh}
            onChange={(e) => setAutoRefresh(Number(e.target.value))}
            className="px-2 py-1 rounded bg-gray-800 border border-gray-700 text-gray-300 text-xs"
          >
            <option value={0}>Auto-refresh: Off</option>
            <option value={2}>2s</option>
            <option value={5}>5s</option>
            <option value={10}>10s</option>
          </select>
          <button onClick={fetchData} disabled={loading} className="p-2 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded bg-red-900/30 border border-red-800 text-red-300 text-sm">
          {error}
          {error.includes('unsupported path') && (
            <p className="mt-1 text-xs text-red-400">
              Active/top queries may not be available on VM cluster vmselect. This works on single-node VictoriaMetrics.
            </p>
          )}
        </div>
      )}

      {/* Active Queries */}
      <div className="rounded-lg border border-gray-800 overflow-hidden">
        <div className="px-4 py-3 bg-gray-900 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-sm font-medium text-white flex items-center gap-2">
            <Clock size={14} className="text-blue-400" />
            Active Queries
            <span className="text-xs text-gray-500">({active.length} running)</span>
          </h2>
        </div>
        {active.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-900/50">
                  <th className="text-left p-3 text-gray-400 font-medium">Query</th>
                  <th className="text-left p-3 text-gray-400 font-medium w-24">Duration</th>
                  <th className="text-left p-3 text-gray-400 font-medium w-36">Client</th>
                  <th className="text-right p-3 text-gray-400 font-medium w-20">Actions</th>
                </tr>
              </thead>
              <tbody>
                {active.map((q) => (
                  <tr key={q.id} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                    <td className="p-3 font-mono text-gray-300 max-w-lg truncate" title={q.query}>{q.query}</td>
                    <td className="p-3 text-gray-400">{q.duration}</td>
                    <td className="p-3 text-gray-500">{q.remote_addr}</td>
                    <td className="p-3 text-right">
                      <button onClick={() => copyQuery(q.query)} className="p-1 text-gray-500 hover:text-white" title="Copy">
                        <Copy size={12} />
                      </button>
                      <button onClick={() => runInExplorer(q.query)} className="p-1 text-gray-500 hover:text-blue-400 ml-1" title="Run in Explorer">
                        <Play size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-center text-gray-500 text-sm">No queries currently executing</div>
        )}
      </div>

      {/* Top Queries */}
      <div className="rounded-lg border border-gray-800 overflow-hidden">
        <div className="px-4 py-3 bg-gray-900 border-b border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-white">Top Queries</h2>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Top N:</label>
              <select value={topN} onChange={(e) => setTopN(Number(e.target.value))} className="px-2 py-1 rounded bg-gray-800 border border-gray-700 text-gray-300 text-xs">
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
              <label className="text-xs text-gray-500">Lifetime:</label>
              <select value={maxLifetime} onChange={(e) => setMaxLifetime(e.target.value)} className="px-2 py-1 rounded bg-gray-800 border border-gray-700 text-gray-300 text-xs">
                <option value="5m">5m</option>
                <option value="15m">15m</option>
                <option value="30m">30m</option>
                <option value="1h">1h</option>
                <option value="6h">6h</option>
              </select>
            </div>
          </div>
          <div className="flex gap-1">
            {([['count', 'By Count'], ['avgDuration', 'By Avg Duration'], ['sumDuration', 'By Total Duration']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTopTab(key)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  topTab === key ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {topData.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-900/50">
                  <th className="text-left p-3 text-gray-400 font-medium w-10">#</th>
                  <th className="text-left p-3 text-gray-400 font-medium">Query</th>
                  <th className="text-right p-3 text-gray-400 font-medium w-20">Count</th>
                  <th className="text-right p-3 text-gray-400 font-medium w-24">Avg Duration</th>
                  <th className="text-right p-3 text-gray-400 font-medium w-20">Actions</th>
                </tr>
              </thead>
              <tbody>
                {topData.map((q, i) => (
                  <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                    <td className="p-3 text-gray-500">{i + 1}</td>
                    <td className="p-3 font-mono text-gray-300 max-w-lg truncate" title={q.query}>{q.query}</td>
                    <td className="p-3 text-right text-gray-400">{q.count.toLocaleString()}</td>
                    <td className="p-3 text-right text-gray-400">{q.avgDurationSeconds.toFixed(3)}s</td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => copyQuery(q.query)}
                        className="p-1 text-gray-500 hover:text-white"
                        title={copied === q.query ? 'Copied!' : 'Copy query'}
                      >
                        <Copy size={12} />
                      </button>
                      <button onClick={() => runInExplorer(q.query)} className="p-1 text-gray-500 hover:text-blue-400 ml-1" title="Run in Explorer">
                        <Play size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-center text-gray-500 text-sm">No top query data available</div>
        )}
      </div>
    </div>
  );
}
