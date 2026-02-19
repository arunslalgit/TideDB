import { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { useActiveConnection } from '../../hooks/useActiveConnection';
import prometheusClient from '../../api/prometheus';
import type { TSDBStatus, BuildInfo, RuntimeInfo } from '../../api/prometheus';

export default function PromTSDB() {
  const { connection, auth } = useActiveConnection();
  const [tsdb, setTsdb] = useState<TSDBStatus | null>(null);
  const [build, setBuild] = useState<BuildInfo | null>(null);
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [flags, setFlags] = useState<Record<string, string> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!connection || connection.type !== 'prometheus') return;
    setLoading(true);
    setError(null);
    try {
      const [tsdbResp, buildResp, runtimeResp, flagsResp] = await Promise.allSettled([
        prometheusClient.getTSDBStatus(connection.url, auth),
        prometheusClient.getBuildInfo(connection.url, auth),
        prometheusClient.getRuntimeInfo(connection.url, auth),
        prometheusClient.getFlags(connection.url, auth),
      ]);
      if (tsdbResp.status === 'fulfilled' && tsdbResp.value.status === 'success') setTsdb(tsdbResp.value.data);
      if (buildResp.status === 'fulfilled' && buildResp.value.status === 'success') setBuild(buildResp.value.data);
      if (runtimeResp.status === 'fulfilled' && runtimeResp.value.status === 'success') setRuntime(runtimeResp.value.data);
      if (flagsResp.status === 'fulfilled' && flagsResp.value.status === 'success') setFlags(flagsResp.value.data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [connection, auth]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const fmt = (n: number) => n.toLocaleString();
  const fmtTime = (ts: number) => ts ? new Date(ts).toLocaleString() : '-';

  if (!connection || connection.type !== 'prometheus') {
    return <div className="flex items-center justify-center h-full text-gray-500"><p>Select a Prometheus connection.</p></div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-white">TSDB Status & Health</h1>
        <button onClick={fetchAll} disabled={loading} className="p-2 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && <div className="p-3 rounded bg-red-900/30 border border-red-800 text-red-300 text-sm">{error}</div>}

      {/* Build info */}
      {build && (
        <div className="rounded-lg border border-gray-800 p-4">
          <h2 className="text-sm font-semibold text-gray-300 mb-3">Build Info</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <InfoCard label="Version" value={build.version} />
            <InfoCard label="Go Version" value={build.goVersion} />
            <InfoCard label="Branch" value={build.branch} />
            <InfoCard label="Build Date" value={build.buildDate} />
          </div>
        </div>
      )}

      {/* Runtime info */}
      {runtime && (
        <div className="rounded-lg border border-gray-800 p-4">
          <h2 className="text-sm font-semibold text-gray-300 mb-3">Runtime</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <InfoCard label="Start Time" value={new Date(runtime.startTime).toLocaleString()} />
            <InfoCard label="Goroutines" value={String(runtime.goroutineCount)} />
            <InfoCard label="GOMAXPROCS" value={String(runtime.GOMAXPROCS)} />
            <InfoCard label="Storage Retention" value={runtime.storageRetention} />
          </div>
        </div>
      )}

      {/* TSDB Stats */}
      {tsdb && (
        <>
          <div className="rounded-lg border border-gray-800 p-4">
            <h2 className="text-sm font-semibold text-gray-300 mb-3">TSDB Head Block</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <InfoCard label="Head Series" value={fmt(tsdb.headStats.numSeries)} />
              <InfoCard label="Head Chunks" value={fmt(tsdb.headStats.chunkCount)} />
              <InfoCard label="Label Pairs" value={fmt(tsdb.headStats.numLabelPairs)} />
              <InfoCard label="Min Time" value={fmtTime(tsdb.headStats.minTime)} />
              <InfoCard label="Max Time" value={fmtTime(tsdb.headStats.maxTime)} />
            </div>
          </div>

          {/* Top cardinality metrics */}
          {tsdb.seriesCountByMetricName && tsdb.seriesCountByMetricName.length > 0 && (
            <div className="rounded-lg border border-gray-800 p-4">
              <h2 className="text-sm font-semibold text-gray-300 mb-3">Top Cardinality Metrics</h2>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left p-2 text-gray-400 font-medium">Metric Name</th>
                    <th className="text-right p-2 text-gray-400 font-medium">Series Count</th>
                  </tr>
                </thead>
                <tbody>
                  {tsdb.seriesCountByMetricName.slice(0, 10).map((m, i) => (
                    <tr key={i} className="border-b border-gray-800/50">
                      <td className="p-2 font-mono text-gray-300">{m.name}</td>
                      <td className="p-2 text-right text-gray-200">{fmt(m.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Top cardinality label pairs */}
          {tsdb.seriesCountByLabelValuePair && tsdb.seriesCountByLabelValuePair.length > 0 && (
            <div className="rounded-lg border border-gray-800 p-4">
              <h2 className="text-sm font-semibold text-gray-300 mb-3">Top Cardinality Label Pairs</h2>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left p-2 text-gray-400 font-medium">Label Pair</th>
                    <th className="text-right p-2 text-gray-400 font-medium">Series Count</th>
                  </tr>
                </thead>
                <tbody>
                  {tsdb.seriesCountByLabelValuePair.slice(0, 10).map((m, i) => (
                    <tr key={i} className="border-b border-gray-800/50">
                      <td className="p-2 font-mono text-gray-300">{m.name}</td>
                      <td className="p-2 text-right text-gray-200">{fmt(m.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Flags */}
      {flags && (
        <div className="rounded-lg border border-gray-800 p-4">
          <h2 className="text-sm font-semibold text-gray-300 mb-3">Runtime Flags</h2>
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {Object.entries(flags).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 text-xs py-1 border-b border-gray-800/30">
                <span className="font-mono text-gray-400">{k}</span>
                <span className="font-mono text-gray-200 text-right truncate max-w-xs" title={v}>{v || '""'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</p>
      <p className="text-sm text-gray-200 font-medium truncate" title={value}>{value}</p>
    </div>
  );
}
