import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, BarChart3 } from 'lucide-react';
import { useActiveConnection } from '../../hooks/useActiveConnection';
import { getTsdbStatusEnhanced, getSeriesCount } from '../../api/victoriametrics';
import prometheusClient from '../../api/prometheus';
import type { VmTsdbStatus } from '../../api/victoriametrics';

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function BarRow({ name, value, max }: { name: string; value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-xs text-gray-300 font-mono flex-1 truncate" title={name}>{name}</span>
      <div className="w-48 flex-shrink-0">
        <div className="h-4 bg-gray-800 rounded overflow-hidden">
          <div className="h-full bg-blue-600 rounded" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <span className="text-xs text-gray-400 w-20 text-right flex-shrink-0">{formatNumber(value)}</span>
    </div>
  );
}

export default function VmTSDB() {
  const { connection, auth } = useActiveConnection();
  const [tsdb, setTsdb] = useState<VmTsdbStatus | null>(null);
  const [seriesCount, setSeriesCount] = useState<number | null>(null);
  const [buildInfo, setBuildInfo] = useState<any>(null);
  const [runtimeInfo, setRuntimeInfo] = useState<any>(null);
  const [flags, setFlags] = useState<Record<string, string> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [topN, setTopN] = useState(10);
  const [focusLabel, setFocusLabel] = useState('');
  const [date, setDate] = useState('');
  const [matchFilter, setMatchFilter] = useState('');

  const fetchData = useCallback(async () => {
    if (!connection || connection.type !== 'victoriametrics') return;
    setLoading(true);
    setError(null);
    try {
      const [tsdbResp, countResp, buildResp, runtimeResp, flagsResp] = await Promise.all([
        getTsdbStatusEnhanced(connection.url, { topN, focusLabel: focusLabel || undefined, date: date || undefined, match: matchFilter || undefined }, auth),
        getSeriesCount(connection.url, auth),
        prometheusClient.getBuildInfo(connection.url, auth).catch(() => null),
        prometheusClient.getRuntimeInfo(connection.url, auth).catch(() => null),
        prometheusClient.getFlags(connection.url, auth).catch(() => null),
      ]);
      setTsdb(tsdbResp);
      setSeriesCount(countResp);
      if (buildResp?.status === 'success') setBuildInfo(buildResp.data);
      if (runtimeResp?.status === 'success') setRuntimeInfo(runtimeResp.data);
      if (flagsResp?.status === 'success') setFlags(flagsResp.data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [connection, auth, topN, focusLabel, date, matchFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (!connection || connection.type !== 'victoriametrics') {
    return <div className="flex items-center justify-center h-full text-gray-500"><p>Select a VictoriaMetrics connection.</p></div>;
  }

  const maxMetric = tsdb?.seriesCountByMetricName?.[0]?.value || 1;
  const maxLabel = tsdb?.seriesCountByLabelName?.[0]?.value || 1;
  const maxPair = tsdb?.seriesCountByLabelValuePair?.[0]?.value || 1;
  const maxFocus = tsdb?.seriesCountByFocusLabelValue?.[0]?.value || 1;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">TSDB Status & Cardinality</h1>
          {seriesCount !== null && (
            <p className="text-sm text-gray-400 mt-1">
              Total Series: <span className="text-white font-medium">{formatNumber(seriesCount)}</span>
              {tsdb?.totalSeriesPrev != null && tsdb.totalSeriesPrev > 0 && (
                <span className="ml-2 text-xs text-gray-500">
                  ({seriesCount >= tsdb.totalSeriesPrev ? '+' : ''}{formatNumber(seriesCount - tsdb.totalSeriesPrev)} vs previous)
                </span>
              )}
            </p>
          )}
        </div>
        <button onClick={fetchData} disabled={loading} className="p-2 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && <div className="p-3 rounded bg-red-900/30 border border-red-800 text-red-300 text-sm">{error}</div>}

      {/* Filters */}
      <div className="rounded-lg border border-gray-800 p-4 bg-gray-900/50">
        <h3 className="text-xs font-semibold text-gray-400 uppercase mb-3 flex items-center gap-1.5">
          <BarChart3 size={12} /> Filters
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Date (YYYYMMDD)</label>
            <input
              type="text"
              placeholder="e.g. 20260219"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-200 text-xs placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Top N</label>
            <select value={topN} onChange={(e) => setTopN(Number(e.target.value))} className="w-full px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-300 text-xs">
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Focus Label</label>
            <input
              type="text"
              placeholder="e.g. instance"
              value={focusLabel}
              onChange={(e) => setFocusLabel(e.target.value)}
              className="w-full px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-200 text-xs placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Match Filter</label>
            <input
              type="text"
              placeholder='e.g. {job="node"}'
              value={matchFilter}
              onChange={(e) => setMatchFilter(e.target.value)}
              className="w-full px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-200 text-xs placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
        <button onClick={fetchData} className="mt-3 px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors">
          Apply Filters
        </button>
      </div>

      {tsdb && (
        <>
          {/* Top Metrics */}
          <div className="rounded-lg border border-gray-800 p-4">
            <h3 className="text-sm font-medium text-white mb-3">Top Metrics by Series Count</h3>
            <div className="space-y-0.5">
              {(tsdb.seriesCountByMetricName || []).map((m) => (
                <BarRow key={m.name} name={m.name} value={m.value} max={maxMetric} />
              ))}
              {(!tsdb.seriesCountByMetricName || tsdb.seriesCountByMetricName.length === 0) && (
                <p className="text-xs text-gray-500">No data</p>
              )}
            </div>
          </div>

          {/* Labels and Pairs side by side */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-gray-800 p-4">
              <h3 className="text-sm font-medium text-white mb-3">Top Labels by Series Count</h3>
              <div className="space-y-0.5">
                {(tsdb.seriesCountByLabelName || []).map((m) => (
                  <BarRow key={m.name} name={m.name} value={m.value} max={maxLabel} />
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-gray-800 p-4">
              <h3 className="text-sm font-medium text-white mb-3">Top Label Value Pairs</h3>
              <div className="space-y-0.5">
                {(tsdb.seriesCountByLabelValuePair || []).map((m) => (
                  <BarRow key={m.name} name={m.name} value={m.value} max={maxPair} />
                ))}
              </div>
            </div>
          </div>

          {/* Focus Label */}
          {focusLabel && tsdb.seriesCountByFocusLabelValue && tsdb.seriesCountByFocusLabelValue.length > 0 && (
            <div className="rounded-lg border border-gray-800 p-4">
              <h3 className="text-sm font-medium text-white mb-3">Focus Label Values ({focusLabel})</h3>
              <div className="space-y-0.5">
                {tsdb.seriesCountByFocusLabelValue.map((m) => (
                  <BarRow key={m.name} name={m.name} value={m.value} max={maxFocus} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Runtime Info */}
      {(buildInfo || runtimeInfo || flags) && (
        <div className="rounded-lg border border-gray-800 p-4">
          <h3 className="text-sm font-medium text-white mb-3">Runtime Info</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            {buildInfo?.version && (
              <div><span className="text-gray-500">Version:</span> <span className="text-gray-200">{buildInfo.version}</span></div>
            )}
            {buildInfo?.goVersion && (
              <div><span className="text-gray-500">Go:</span> <span className="text-gray-200">{buildInfo.goVersion}</span></div>
            )}
            {runtimeInfo?.storageRetention && (
              <div><span className="text-gray-500">Retention:</span> <span className="text-gray-200">{runtimeInfo.storageRetention}</span></div>
            )}
            {runtimeInfo?.startTime && (
              <div><span className="text-gray-500">Started:</span> <span className="text-gray-200">{new Date(runtimeInfo.startTime).toLocaleString()}</span></div>
            )}
          </div>
          {flags && Object.keys(flags).length > 0 && (
            <details className="mt-3">
              <summary className="text-xs text-gray-400 cursor-pointer hover:text-white">Startup Flags ({Object.keys(flags).length})</summary>
              <div className="mt-2 max-h-48 overflow-auto">
                <table className="w-full text-xs">
                  <tbody>
                    {Object.entries(flags).map(([k, v]) => (
                      <tr key={k} className="border-b border-gray-800/30">
                        <td className="py-1 pr-3 text-gray-400 font-mono">{k}</td>
                        <td className="py-1 text-gray-300 font-mono">{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
