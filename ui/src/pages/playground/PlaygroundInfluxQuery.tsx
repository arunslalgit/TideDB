import { useState, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Play, Clock, Table2, BarChart3, Zap, ChevronRight, ChevronDown } from 'lucide-react';
import {
  INFLUX_DATABASES, INFLUX_MEASUREMENTS, INFLUX_TAG_KEYS, INFLUX_FIELD_KEYS,
  INFLUX_EXAMPLE_QUERIES, generateInfluxQueryResult,
} from '../../api/playground/mockData';

const CHART_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#22c55e', '#06b6d4'];

export default function PlaygroundInfluxQuery() {
  const [selectedDb, setSelectedDb] = useState('telegraf');
  const [queryText, setQueryText] = useState(INFLUX_EXAMPLE_QUERIES[0].query);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('chart');
  const [history, setHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Schema tree
  const [expandedDbs, setExpandedDbs] = useState<Set<string>>(new Set(['telegraf']));
  const [expandedMeasurements, setExpandedMeasurements] = useState<Set<string>>(new Set());

  const toggleDb = (db: string) => {
    setExpandedDbs((prev) => {
      const next = new Set(prev);
      if (next.has(db)) next.delete(db); else next.add(db);
      return next;
    });
  };

  const toggleMeasurement = (key: string) => {
    setExpandedMeasurements((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const runQuery = useCallback(() => {
    const t0 = Date.now();
    setError(null);
    try {
      const res = generateInfluxQueryResult(queryText, selectedDb);
      if (res.results?.[0]?.error) {
        setError(res.results[0].error);
        setResult(null);
      } else {
        setResult(res);
        setHistory((prev) => {
          const next = [queryText, ...prev.filter((q) => q !== queryText)].slice(0, 20);
          return next;
        });
      }
    } catch (e: any) {
      setError(e.message);
      setResult(null);
    }
    setElapsed(Date.now() - t0);
  }, [queryText, selectedDb]);

  const loadExample = (q: typeof INFLUX_EXAMPLE_QUERIES[0]) => {
    setQueryText(q.query);
    if (q.db) setSelectedDb(q.db);
  };

  // Build chart data from result
  const chartData: any[] = [];
  const seriesNames: string[] = [];
  if (result?.results?.[0]?.series) {
    const allSeries = result.results[0].series;
    // Merge by time
    const timeMap = new Map<string, Record<string, any>>();
    allSeries.forEach((s: any, si: number) => {
      const cols = s.columns || [];
      const tags = s.tags ? Object.values(s.tags).join('/') : '';
      const namePrefix = tags ? `${s.name || ''}[${tags}]` : (s.name || `series-${si}`);
      const numericCols = cols.filter((_c: string, idx: number) => idx > 0 && typeof s.values?.[0]?.[idx] === 'number');
      numericCols.forEach((col: string) => {
        const key = numericCols.length > 1 ? `${namePrefix}.${col}` : namePrefix;
        seriesNames.push(key);
      });
      (s.values || []).forEach((row: any[]) => {
        const time = row[0];
        if (!timeMap.has(time)) timeMap.set(time, { time });
        const entry = timeMap.get(time)!;
        numericCols.forEach((col: string) => {
          const colIdx = cols.indexOf(col);
          const key = numericCols.length > 1 ? `${namePrefix}.${col}` : namePrefix;
          entry[key] = row[colIdx];
        });
      });
    });
    chartData.push(...Array.from(timeMap.values()).sort((a, b) => a.time < b.time ? -1 : 1));
  }

  // Table columns/rows
  const tableColumns: string[] = [];
  const tableRows: any[][] = [];
  if (result?.results?.[0]?.series?.[0]) {
    const s = result.results[0].series[0];
    tableColumns.push(...(s.columns || []));
    if (s.tags) {
      Object.keys(s.tags).forEach((k) => { if (!tableColumns.includes(k)) tableColumns.push(k); });
    }
    (result.results[0].series || []).forEach((sr: any) => {
      (sr.values || []).forEach((row: any[]) => {
        const fullRow = [...row];
        if (sr.tags) {
          Object.values(sr.tags).forEach((v) => fullRow.push(v));
        }
        tableRows.push(fullRow);
      });
    });
  }

  return (
    <div className="flex h-full">
      {/* Schema sidebar */}
      <div className="w-56 border-r border-gray-800 overflow-y-auto flex-shrink-0 bg-gray-900/50">
        <div className="p-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Schema Browser</h3>
          {INFLUX_DATABASES.map((db) => (
            <div key={db}>
              <button
                onClick={() => toggleDb(db)}
                className="flex items-center gap-1 w-full text-left text-xs py-1 px-1 hover:bg-gray-800 rounded text-gray-300"
              >
                {expandedDbs.has(db) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <span className="font-medium">{db}</span>
              </button>
              {expandedDbs.has(db) && (INFLUX_MEASUREMENTS[db] || []).map((m) => {
                const mKey = `${db}/${m}`;
                return (
                  <div key={mKey} className="ml-3">
                    <button
                      onClick={() => toggleMeasurement(mKey)}
                      className="flex items-center gap-1 w-full text-left text-[11px] py-0.5 px-1 hover:bg-gray-800 rounded text-gray-400"
                    >
                      {expandedMeasurements.has(mKey) ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                      {m}
                    </button>
                    {expandedMeasurements.has(mKey) && (
                      <div className="ml-4 text-[10px] text-gray-500 space-y-0.5 py-0.5">
                        {(INFLUX_TAG_KEYS[m] || []).map((t) => (
                          <div key={t} className="flex items-center gap-1">
                            <span className="text-blue-400">tag</span> {t}
                          </div>
                        ))}
                        {(INFLUX_FIELD_KEYS[m] || []).map((f) => (
                          <div key={f.key} className="flex items-center gap-1">
                            <span className="text-green-400">{f.type}</span> {f.key}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Main query area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Example queries bar */}
        <div className="border-b border-gray-800 px-4 py-2 flex items-center gap-2 flex-wrap bg-gray-900/30">
          <span className="text-[10px] text-gray-500 uppercase font-semibold">Examples:</span>
          {INFLUX_EXAMPLE_QUERIES.map((eq) => (
            <button
              key={eq.label}
              onClick={() => loadExample(eq)}
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
            <select
              value={selectedDb}
              onChange={(e) => setSelectedDb(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded text-xs text-gray-300 px-2 py-2"
            >
              {INFLUX_DATABASES.map((db) => <option key={db} value={db}>{db}</option>)}
            </select>
            <textarea
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runQuery(); } }}
              rows={3}
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm font-mono text-gray-200 focus:outline-none focus:border-blue-500 resize-y"
              placeholder="Enter InfluxQL query..."
            />
            <button
              onClick={runQuery}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium transition-colors"
            >
              <Play size={14} />
              Run
            </button>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>Ctrl+Enter to run</span>
            {elapsed !== null && (
              <span className="flex items-center gap-1">
                <Clock size={10} /> {elapsed}ms
              </span>
            )}
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-1 text-gray-500 hover:text-gray-300 transition-colors"
            >
              <Clock size={10} /> History ({history.length})
            </button>
          </div>
          {showHistory && history.length > 0 && (
            <div className="bg-gray-800/50 rounded p-2 max-h-32 overflow-y-auto space-y-1">
              {history.map((q, i) => (
                <button
                  key={i}
                  onClick={() => { setQueryText(q); setShowHistory(false); }}
                  className="block w-full text-left text-xs font-mono text-gray-400 hover:text-white truncate px-2 py-0.5 hover:bg-gray-700 rounded"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>

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
                {result?.results?.[0]?.series && (
                  <span className="text-xs text-gray-500">
                    {result.results[0].series.length} series, {tableRows.length} rows
                  </span>
                )}
              </div>

              {viewMode === 'chart' && chartData.length > 0 && seriesNames.length > 0 && (
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis
                        dataKey="time"
                        tick={{ fontSize: 10, fill: '#9ca3af' }}
                        tickFormatter={(v) => new Date(v).toLocaleTimeString()}
                      />
                      <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '6px', fontSize: '12px' }}
                        labelFormatter={(v) => new Date(v).toLocaleString()}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      {seriesNames.slice(0, 6).map((name, i) => (
                        <Line
                          key={name}
                          type="monotone"
                          dataKey={name}
                          stroke={CHART_COLORS[i % CHART_COLORS.length]}
                          dot={false}
                          strokeWidth={1.5}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {viewMode === 'table' && tableColumns.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-700">
                        {tableColumns.map((col) => (
                          <th key={col} className="text-left px-3 py-2 text-gray-400 font-semibold">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.slice(0, 200).map((row, ri) => (
                        <tr key={ri} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                          {row.map((cell, ci) => (
                            <td key={ci} className="px-3 py-1.5 text-gray-300 font-mono">
                              {typeof cell === 'number' ? cell.toLocaleString() : String(cell ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {tableRows.length > 200 && (
                    <p className="text-xs text-gray-500 mt-2 px-3">Showing 200 of {tableRows.length} rows</p>
                  )}
                </div>
              )}

              {viewMode === 'chart' && (chartData.length === 0 || seriesNames.length === 0) && (
                <div className="text-gray-500 text-sm py-8 text-center">
                  No chart data — this query returns metadata. Switch to Table view.
                </div>
              )}
            </>
          )}

          {!result && !error && (
            <div className="text-gray-500 text-sm py-12 text-center">
              <Zap size={24} className="mx-auto mb-2 text-gray-600" />
              Select an example query or write your own, then click <strong>Run</strong>.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
