import { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Clock, Trash2, BarChart3, Table2, Code2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useActiveConnection } from '../../hooks/useActiveConnection';
import prometheusClient from '../../api/prometheus';
import type { RangeMatrix, InstantVector } from '../../api/prometheus';

const COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#a855f7',
  '#6366f1', '#84cc16', '#e11d48', '#0ea5e9', '#d946ef',
];

const TIME_RANGES = [
  { label: '15m', seconds: 900 },
  { label: '1h', seconds: 3600 },
  { label: '3h', seconds: 10800 },
  { label: '6h', seconds: 21600 },
  { label: '12h', seconds: 43200 },
  { label: '1d', seconds: 86400 },
  { label: '7d', seconds: 604800 },
];

function formatSeriesName(metric: Record<string, string>): string {
  const name = metric.__name__ || '';
  const labels = Object.entries(metric)
    .filter(([k]) => k !== '__name__')
    .map(([k, v]) => `${k}="${v}"`)
    .join(', ');
  return labels ? `${name}{${labels}}` : name;
}

function autoStep(rangeSeconds: number): string {
  if (rangeSeconds <= 3600) return '15s';
  if (rangeSeconds <= 21600) return '60s';
  if (rangeSeconds <= 86400) return '300s';
  return '600s';
}

export default function PromQueryExplorer() {
  const { connection, auth } = useActiveConnection();

  const [query, setQuery] = useState('up');
  const [rangeIdx, setRangeIdx] = useState(1); // 1h default
  const [resultType, setResultType] = useState<'matrix' | 'vector' | 'scalar' | 'string' | null>(null);
  const [matrixData, setMatrixData] = useState<RangeMatrix[]>([]);
  const [vectorData, setVectorData] = useState<InstantVector[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'chart' | 'table' | 'json'>('chart');
  const [rawJson, setRawJson] = useState<string>('');

  // Metrics list for autocomplete
  const [metrics, setMetrics] = useState<string[]>([]);
  const [metricSearch, setMetricSearch] = useState('');
  const [showMetrics, setShowMetrics] = useState(false);

  // Query history
  const [history, setHistory] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('tsui_prom_history') || '[]'); } catch { return []; }
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!connection || (connection.type !== 'prometheus' && connection.type !== 'victoriametrics')) return;
    prometheusClient.getLabelValues(connection.url, '__name__', auth)
      .then((r) => { if (r.status === 'success') setMetrics(r.data || []); })
      .catch(() => {});
  }, [connection, auth]);

  const executeQuery = useCallback(async () => {
    if (!connection || !query.trim()) return;
    setRunning(true);
    setError(null);
    const t0 = Date.now();

    try {
      const range = TIME_RANGES[rangeIdx];
      const now = Math.floor(Date.now() / 1000);
      const start = (now - range.seconds).toString();
      const end = now.toString();
      const step = autoStep(range.seconds);

      const resp = await prometheusClient.rangeQuery(connection.url, query.trim(), start, end, step, auth);
      setDuration(Date.now() - t0);
      setRawJson(JSON.stringify(resp, null, 2));

      if (resp.status === 'error') {
        setError(resp.error || 'Query failed');
        return;
      }

      setResultType(resp.data.resultType as any);
      if (resp.data.resultType === 'matrix') {
        setMatrixData(resp.data.result as RangeMatrix[]);
        setVectorData([]);
      } else {
        // For non-range results, do instant query
        const instantResp = await prometheusClient.instantQuery(connection.url, query.trim(), undefined, auth);
        setRawJson(JSON.stringify(instantResp, null, 2));
        if (instantResp.data.resultType === 'vector') {
          setVectorData(instantResp.data.result);
          setMatrixData([]);
          setResultType('vector');
        }
      }

      // Save to history
      setHistory((prev) => {
        const filtered = prev.filter((h) => h !== query.trim());
        const updated = [query.trim(), ...filtered].slice(0, 30);
        localStorage.setItem('tsui_prom_history', JSON.stringify(updated));
        return updated;
      });
    } catch (e: any) {
      setError(e.message);
      setDuration(Date.now() - t0);
    } finally {
      setRunning(false);
    }
  }, [connection, query, rangeIdx, auth]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      executeQuery();
    }
  };

  // Chart data transformation
  const chartData = (() => {
    if (resultType !== 'matrix' || matrixData.length === 0) return [];
    const allTimes = new Set<number>();
    matrixData.forEach((s) => s.values.forEach(([t]) => allTimes.add(t)));
    const sorted = Array.from(allTimes).sort();
    return sorted.map((t) => {
      const point: Record<string, any> = { time: t * 1000 };
      matrixData.forEach((s, i) => {
        const val = s.values.find(([vt]) => vt === t);
        point[`series_${i}`] = val ? parseFloat(val[1]) : null;
      });
      return point;
    });
  })();

  const filteredMetrics = metricSearch
    ? metrics.filter((m) => m.toLowerCase().includes(metricSearch.toLowerCase())).slice(0, 50)
    : metrics.slice(0, 50);

  const isVm = connection?.type === 'victoriametrics';
  const queryLanguage = isVm ? 'MetricsQL' : 'PromQL';

  if (!connection || (connection.type !== 'prometheus' && connection.type !== 'victoriametrics')) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <p>Select a Prometheus or VictoriaMetrics connection to start querying.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Metrics sidebar */}
      <div className={`${showMetrics ? 'w-64' : 'w-0'} flex-shrink-0 border-r border-gray-800 overflow-hidden transition-all`}>
        <div className="p-3 space-y-2 h-full flex flex-col">
          <h3 className="text-xs font-semibold text-gray-400 uppercase">Metrics</h3>
          <input
            type="text"
            placeholder="Search metrics..."
            value={metricSearch}
            onChange={(e) => setMetricSearch(e.target.value)}
            className="w-full px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-200 text-xs placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <div className="flex-1 overflow-y-auto space-y-0.5">
            {filteredMetrics.map((m) => (
              <button
                key={m}
                onClick={() => setQuery(m)}
                className="block w-full text-left px-2 py-1 text-xs text-gray-300 hover:bg-gray-800 rounded truncate"
                title={m}
              >
                {m}
              </button>
            ))}
            {metrics.length === 0 && (
              <p className="text-xs text-gray-600 px-2 py-4">No metrics loaded</p>
            )}
          </div>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Query bar */}
        <div className="p-4 border-b border-gray-800 space-y-3">
          <div className="flex gap-2">
            <button
              onClick={() => setShowMetrics((s) => !s)}
              className="px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-400 hover:text-white text-xs"
              title="Toggle metrics panel"
            >
              {showMetrics ? 'Hide' : 'Metrics'}
            </button>
            <textarea
              ref={textareaRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              placeholder={`Enter ${queryLanguage} query... (Ctrl+Enter to execute)`}
              className="flex-1 px-3 py-2 rounded bg-gray-800 border border-gray-700 text-gray-100 text-sm font-mono placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
            />
            <button
              onClick={executeQuery}
              disabled={running || !query.trim()}
              className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-40 flex items-center gap-1.5"
            >
              <Play size={14} />
              {running ? 'Running...' : 'Execute'}
            </button>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Time range */}
            <div className="flex items-center gap-1">
              <Clock size={12} className="text-gray-500" />
              <span className="text-xs text-gray-500">Range:</span>
              {TIME_RANGES.map((tr, idx) => (
                <button
                  key={tr.label}
                  onClick={() => setRangeIdx(idx)}
                  className={`px-2 py-0.5 rounded text-xs ${
                    idx === rangeIdx
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  {tr.label}
                </button>
              ))}
            </div>

            {/* View mode */}
            <div className="flex items-center gap-1 ml-auto">
              <button
                onClick={() => setViewMode('chart')}
                className={`p-1.5 rounded ${viewMode === 'chart' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-white'}`}
                title="Chart"
              >
                <BarChart3 size={14} />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded ${viewMode === 'table' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-white'}`}
                title="Table"
              >
                <Table2 size={14} />
              </button>
              <button
                onClick={() => setViewMode('json')}
                className={`p-1.5 rounded ${viewMode === 'json' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-white'}`}
                title="Raw JSON"
              >
                <Code2 size={14} />
              </button>
            </div>

            {duration !== null && (
              <span className="text-xs text-gray-500">{duration}ms</span>
            )}
          </div>

          {/* History */}
          {history.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-xs text-gray-500">History:</span>
              {history.slice(0, 8).map((h, i) => (
                <button
                  key={i}
                  onClick={() => setQuery(h)}
                  className="px-2 py-0.5 rounded bg-gray-800 text-gray-400 text-xs hover:text-white truncate max-w-48"
                >
                  {h}
                </button>
              ))}
              <button
                onClick={() => { setHistory([]); localStorage.removeItem('tsui_prom_history'); }}
                className="p-1 text-gray-600 hover:text-red-400"
                title="Clear history"
              >
                <Trash2 size={10} />
              </button>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mt-3 p-3 rounded bg-red-900/30 border border-red-800 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Results */}
        <div className="flex-1 overflow-auto p-4">
          {viewMode === 'chart' && resultType === 'matrix' && chartData.length > 0 && (
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    dataKey="time"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={(v) => new Date(v).toLocaleTimeString()}
                    stroke="#6b7280"
                    fontSize={11}
                  />
                  <YAxis stroke="#6b7280" fontSize={11} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 6 }}
                    labelFormatter={(v) => new Date(v as number).toLocaleString()}
                    formatter={(value: any) => [typeof value === 'number' ? value.toFixed(4) : value]}
                  />
                  <Legend
                    formatter={(value: string) => {
                      const idx = parseInt(value.replace('series_', ''));
                      return matrixData[idx] ? formatSeriesName(matrixData[idx].metric) : value;
                    }}
                    wrapperStyle={{ fontSize: 11 }}
                  />
                  {matrixData.slice(0, 15).map((_, i) => (
                    <Line
                      key={i}
                      type="monotone"
                      dataKey={`series_${i}`}
                      stroke={COLORS[i % COLORS.length]}
                      dot={false}
                      strokeWidth={1.5}
                      connectNulls={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
              {matrixData.length > 15 && (
                <p className="text-xs text-gray-500 mt-2">Showing 15 of {matrixData.length} series on chart. Switch to table view for all.</p>
              )}
            </div>
          )}

          {viewMode === 'table' && resultType === 'matrix' && matrixData.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left p-2 text-gray-400 font-medium">Series</th>
                    <th className="text-left p-2 text-gray-400 font-medium">Last Value</th>
                    <th className="text-left p-2 text-gray-400 font-medium">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {matrixData.map((s, i) => (
                    <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-900">
                      <td className="p-2 font-mono text-gray-300 max-w-md truncate" title={formatSeriesName(s.metric)}>
                        <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        {formatSeriesName(s.metric)}
                      </td>
                      <td className="p-2 text-gray-200">{s.values.length > 0 ? s.values[s.values.length - 1][1] : '-'}</td>
                      <td className="p-2 text-gray-400">{s.values.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {viewMode === 'table' && resultType === 'vector' && vectorData.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left p-2 text-gray-400 font-medium">Metric</th>
                    <th className="text-left p-2 text-gray-400 font-medium">Value</th>
                    <th className="text-left p-2 text-gray-400 font-medium">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {vectorData.map((v, i) => (
                    <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-900">
                      <td className="p-2 font-mono text-gray-300 max-w-md truncate">{formatSeriesName(v.metric)}</td>
                      <td className="p-2 text-gray-200">{v.value[1]}</td>
                      <td className="p-2 text-gray-400">{new Date(v.value[0] * 1000).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {viewMode === 'json' && rawJson && (
            <pre className="bg-gray-900 rounded p-4 text-xs text-gray-300 font-mono overflow-auto whitespace-pre-wrap border border-gray-800">
              {rawJson}
            </pre>
          )}

          {!error && !running && !rawJson && (
            <div className="flex items-center justify-center h-full text-gray-600 text-sm">
              Enter a {queryLanguage} query and press Execute or Ctrl+Enter
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
