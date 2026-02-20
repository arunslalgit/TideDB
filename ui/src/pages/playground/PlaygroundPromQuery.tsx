import { useState, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Play, Clock, Table2, BarChart3, Zap } from 'lucide-react';
import {
  PROM_EXAMPLE_QUERIES, VM_EXAMPLE_QUERIES,
  PROM_METRIC_NAMES, generatePromRangeResult,
} from '../../api/playground/mockData';
import { usePlayground } from '../../api/playground/PlaygroundContext';

const COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#a855f7',
];

const TIME_RANGES = [
  { label: '15m', seconds: 900 },
  { label: '1h', seconds: 3600 },
  { label: '3h', seconds: 10800 },
  { label: '6h', seconds: 21600 },
  { label: '1d', seconds: 86400 },
];

function autoStep(rangeSeconds: number): number {
  if (rangeSeconds <= 3600) return 15;
  if (rangeSeconds <= 21600) return 60;
  if (rangeSeconds <= 86400) return 300;
  return 600;
}

function formatSeriesName(metric: Record<string, string>): string {
  const name = metric.__name__ || '';
  const labels = Object.entries(metric)
    .filter(([k]) => k !== '__name__')
    .map(([k, v]) => `${k}="${v}"`)
    .join(', ');
  return labels ? `${name}{${labels}}` : name;
}

export default function PlaygroundPromQuery() {
  const { backendType } = usePlayground();
  const isVM = backendType === 'victoriametrics';
  const examples = isVM ? VM_EXAMPLE_QUERIES : PROM_EXAMPLE_QUERIES;

  const [query, setQuery] = useState('up');
  const [rangeIdx, setRangeIdx] = useState(1);
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');
  const [result, setResult] = useState<any>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, setHistory] = useState<string[]>([]);
  const [showMetrics, setShowMetrics] = useState(false);
  const [metricSearch, setMetricSearch] = useState('');

  const runQuery = useCallback(() => {
    const t0 = Date.now();
    setError(null);
    try {
      const range = TIME_RANGES[rangeIdx];
      const endSec = Math.floor(Date.now() / 1000);
      const startSec = endSec - range.seconds;
      const step = autoStep(range.seconds);
      const res = generatePromRangeResult(query, startSec, endSec, step);
      setResult(res);
      setHistory((prev) => [query, ...prev.filter((q) => q !== query)].slice(0, 20));
    } catch (e: any) {
      setError(e.message);
      setResult(null);
    }
    setElapsed(Date.now() - t0);
  }, [query, rangeIdx]);

  // Build chart data
  const chartData: any[] = [];
  const seriesLabels: string[] = [];
  if (result?.data?.result) {
    const allSeries = result.data.result;
    allSeries.forEach((s: any) => {
      const label = formatSeriesName(s.metric);
      seriesLabels.push(label);
    });
    // Merge by timestamp
    const timeMap = new Map<number, Record<string, any>>();
    allSeries.forEach((s: any, si: number) => {
      const label = seriesLabels[si];
      (s.values || []).forEach(([ts, val]: [number, string]) => {
        if (!timeMap.has(ts)) timeMap.set(ts, { time: ts });
        timeMap.get(ts)![label] = parseFloat(val);
      });
    });
    chartData.push(...Array.from(timeMap.values()).sort((a, b) => a.time - b.time));
  }

  const filteredMetrics = PROM_METRIC_NAMES.filter((m) =>
    !metricSearch || m.toLowerCase().includes(metricSearch.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      {/* Example queries */}
      <div className="border-b border-gray-800 px-4 py-2 flex items-center gap-2 flex-wrap bg-gray-900/30">
        <span className="text-[10px] text-gray-500 uppercase font-semibold">Examples:</span>
        {examples.map((eq) => (
          <button
            key={eq.label}
            onClick={() => setQuery(eq.query)}
            title={eq.description}
            className="text-[11px] px-2 py-0.5 rounded bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
          >
            {eq.label}
          </button>
        ))}
      </div>

      {/* Query editor */}
      <div className="border-b border-gray-800 p-4 space-y-2">
        <div className="flex gap-2 items-start">
          <div className="flex-1 space-y-1">
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runQuery(); } }}
              rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm font-mono text-gray-200 focus:outline-none focus:border-blue-500 resize-y"
              placeholder={isVM ? 'Enter MetricsQL query...' : 'Enter PromQL query...'}
            />
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-500">Metrics:</span>
              <button
                onClick={() => setShowMetrics(!showMetrics)}
                className="text-[10px] text-blue-400 hover:text-blue-300"
              >
                {showMetrics ? 'Hide' : `Browse (${PROM_METRIC_NAMES.length})`}
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex gap-1">
              {TIME_RANGES.map((tr, i) => (
                <button
                  key={tr.label}
                  onClick={() => setRangeIdx(i)}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                    rangeIdx === i ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  {tr.label}
                </button>
              ))}
            </div>
            <button
              onClick={runQuery}
              className="flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium transition-colors"
            >
              <Play size={14} />
              Execute
            </button>
          </div>
        </div>
        {elapsed !== null && (
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Clock size={10} /> {elapsed}ms
          </div>
        )}
      </div>

      {/* Metrics browser dropdown */}
      {showMetrics && (
        <div className="border-b border-gray-800 px-4 py-2 bg-gray-900/50 max-h-40 overflow-y-auto">
          <input
            type="text"
            placeholder="Filter metrics..."
            value={metricSearch}
            onChange={(e) => setMetricSearch(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 mb-1 focus:outline-none focus:border-blue-500"
          />
          <div className="flex flex-wrap gap-1">
            {filteredMetrics.map((m) => (
              <button
                key={m}
                onClick={() => { setQuery(m); setShowMetrics(false); }}
                className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white font-mono"
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      <div className="flex-1 overflow-auto p-4">
        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded p-3 text-sm text-red-300 mb-4">{error}</div>
        )}

        {result && !error && (
          <>
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={() => setViewMode('chart')}
                className={`flex items-center gap-1 px-3 py-1 rounded text-xs font-medium transition-colors ${viewMode === 'chart' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
              >
                <BarChart3 size={12} /> Chart
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-1 px-3 py-1 rounded text-xs font-medium transition-colors ${viewMode === 'table' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
              >
                <Table2 size={12} /> Table
              </button>
              <span className="text-xs text-gray-500">
                {result.data?.result?.length || 0} series
              </span>
            </div>

            {viewMode === 'chart' && chartData.length > 0 && (
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                      tickFormatter={(v) => new Date(v * 1000).toLocaleTimeString()}
                    />
                    <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '6px', fontSize: '12px' }}
                      labelFormatter={(v) => new Date(v * 1000).toLocaleString()}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    {seriesLabels.slice(0, 10).map((name, i) => (
                      <Line
                        key={name}
                        type="monotone"
                        dataKey={name}
                        stroke={COLORS[i % COLORS.length]}
                        dot={false}
                        strokeWidth={1.5}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {viewMode === 'table' && result.data?.result && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left px-3 py-2 text-gray-400 font-semibold">Series</th>
                      <th className="text-left px-3 py-2 text-gray-400 font-semibold">Timestamp</th>
                      <th className="text-left px-3 py-2 text-gray-400 font-semibold">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.data.result.map((s: any, si: number) => {
                      const label = formatSeriesName(s.metric);
                      const vals = s.values || (s.value ? [s.value] : []);
                      return vals.slice(0, 50).map(([ts, val]: [number, string], vi: number) => (
                        <tr key={`${si}-${vi}`} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                          {vi === 0 && (
                            <td rowSpan={Math.min(vals.length, 50)} className="px-3 py-1.5 text-gray-300 font-mono align-top">{label}</td>
                          )}
                          <td className="px-3 py-1.5 text-gray-400 font-mono">{new Date(ts * 1000).toLocaleString()}</td>
                          <td className="px-3 py-1.5 text-gray-200 font-mono">{val}</td>
                        </tr>
                      ));
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {!result && !error && (
          <div className="text-gray-500 text-sm py-12 text-center">
            <Zap size={24} className="mx-auto mb-2 text-gray-600" />
            Select an example query or write your own, then click <strong>Execute</strong>.
          </div>
        )}
      </div>
    </div>
  );
}
