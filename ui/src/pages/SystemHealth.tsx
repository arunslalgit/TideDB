import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Activity, Server, HardDrive, Clock, Cpu, XCircle, RefreshCw, ChevronLeft, ChevronRight, Download, ChevronDown, ChevronUp, FileText, BarChart3 } from 'lucide-react';
import { client } from '../api/client';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ServerInfo {
  version: string;
  uptime: string;
  goVersion: string;
  os: string;
  arch: string;
  pid: string;
}

interface MetricPoint {
  time: string;
  pointsWritten: number;
  queriesExecuted: number;
}

interface RunningQuery {
  qid: number | string;
  database: string;
  query: string;
  duration: string;
}

interface ShardGroup {
  id: number | string;
  database: string;
  retentionPolicy: string;
  startTime: string;
  endTime: string;
  expiryTime: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatTimestamp(ts: string): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

/**
 * Parse SHOW DIAGNOSTICS result into a flat map of key -> value for the
 * "system" section.
 */
function parseDiagnosticsSystem(result: any): Partial<ServerInfo> {
  const info: Partial<ServerInfo> = {};
  if (!result?.results) return info;

  for (const res of result.results) {
    if (!res.series) continue;
    for (const series of res.series) {
      const sectionName: string = (series.name ?? '').toLowerCase();

      if (sectionName === 'system') {
        const cols: string[] = series.columns ?? [];
        const vals: any[][] = series.values ?? [];
        if (vals.length === 0) continue;
        const row = vals[0];
        const get = (key: string) => {
          const idx = cols.indexOf(key);
          return idx >= 0 ? String(row[idx] ?? '') : '';
        };
        info.uptime = get('uptime') || get('upTime') || get('currentTime');
        info.pid = get('PID') || get('pid');
      }

      if (sectionName === 'runtime') {
        const cols: string[] = series.columns ?? [];
        const vals2: any[][] = series.values ?? [];
        if (vals2.length === 0) continue;
        const row = vals2[0];
        const get = (key: string) => {
          const idx = cols.indexOf(key);
          return idx >= 0 ? String(row[idx] ?? '') : '';
        };
        info.goVersion = get('version') || get('GOOS');
        info.os = get('GOOS');
        info.arch = get('GOARCH');
      }

      if (sectionName === 'build') {
        const cols: string[] = series.columns ?? [];
        const vals3: any[][] = series.values ?? [];
        if (vals3.length === 0) continue;
        const row = vals3[0];
        const get = (key: string) => {
          const idx = cols.indexOf(key);
          return idx >= 0 ? String(row[idx] ?? '') : '';
        };
        info.version = get('Version') || get('version');
        if (!info.goVersion) info.goVersion = get('GoVersion') || get('goVersion');
        if (!info.os) info.os = get('OS') || get('os');
        if (!info.arch) info.arch = get('Arch') || get('arch');
      }
    }
  }

  return info;
}

/**
 * Extract a named stat value from SHOW STATS results.
 * Searches all series for a column match.
 */
function extractStat(result: any, sectionName: string, columnName: string): number {
  if (!result?.results) return 0;
  for (const res of result.results) {
    if (!res.series) continue;
    for (const series of res.series) {
      const name: string = (series.name ?? '').toLowerCase();
      if (name !== sectionName.toLowerCase()) continue;
      const cols: string[] = series.columns ?? [];
      const vals: any[][] = series.values ?? [];
      const idx = cols.indexOf(columnName);
      if (idx < 0) continue;
      if (vals.length > 0) return Number(vals[0][idx]) || 0;
    }
  }
  return 0;
}

// ── Error Banner ──────────────────────────────────────────────────────────────

interface ErrorBannerProps {
  message: string;
  onDismiss: () => void;
}

function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <div className="flex items-start justify-between bg-red-950/60 border border-red-700 rounded-md px-4 py-3 mb-4 text-sm text-red-300">
      <span className="font-mono break-all">{message}</span>
      <button
        onClick={onDismiss}
        className="ml-4 flex-shrink-0 text-red-400 hover:text-red-200 transition-colors duration-150"
      >
        &times;
      </button>
    </div>
  );
}

// ── Info Card ─────────────────────────────────────────────────────────────────

interface InfoCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

function InfoCard({ icon, label, value }: InfoCardProps) {
  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-gray-400 text-xs font-semibold uppercase tracking-wider">
        {icon}
        {label}
      </div>
      <div className="text-gray-100 text-sm font-mono break-all leading-relaxed">
        {value || <span className="text-gray-600 italic">—</span>}
      </div>
    </div>
  );
}

// ── Custom Tooltip for recharts ───────────────────────────────────────────────

interface ChartTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
}

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-xs shadow-lg">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.dataKey} style={{ color: entry.color }}>
          {entry.name}: <span className="font-mono font-semibold">{entry.value.toLocaleString()}</span>
        </p>
      ))}
    </div>
  );
}

// ── Section Heading ───────────────────────────────────────────────────────────

interface SectionHeadingProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: React.ReactNode;
}

function SectionHeading({ icon, title, subtitle }: SectionHeadingProps) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-blue-400">{icon}</span>
      <h2 className="text-base font-semibold text-gray-200">{title}</h2>
      {subtitle && <span className="text-xs text-gray-500">{subtitle}</span>}
    </div>
  );
}

// ── Diagnostics Section Card ───────────────────────────────────────────────

interface DiagnosticSection {
  name: string;
  columns: string[];
  values: any[][];
}

function parseDiagnosticSections(result: any): DiagnosticSection[] {
  const sections: DiagnosticSection[] = [];
  if (!result?.results) return sections;
  for (const res of result.results) {
    for (const series of res.series ?? []) {
      sections.push({
        name: series.name ?? 'Unknown',
        columns: series.columns ?? [],
        values: series.values ?? [],
      });
    }
  }
  return sections;
}

interface DiagnosticCardProps {
  section: DiagnosticSection;
}

function DiagnosticCard({ section }: DiagnosticCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
      <button onClick={() => setExpanded((e) => !e)}
        className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-gray-750 transition-colors duration-150">
        <span className="text-sm font-semibold text-gray-200">{section.name}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{section.columns.length} fields</span>
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>
      {expanded && section.values.length > 0 && (
        <div className="border-t border-gray-700 px-4 py-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {section.columns.map((col, ci) => (
              <div key={col} className="flex items-start gap-2">
                <span className="text-xs text-gray-500 min-w-[120px] font-mono">{col}:</span>
                <span className="text-xs text-gray-200 font-mono break-all">{String(section.values[0][ci] ?? '—')}</span>
              </div>
            ))}
          </div>
          {section.values.length > 1 && (
            <div className="mt-3 border-t border-gray-700 pt-3">
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-700">
                      {section.columns.map((col) => (
                        <th key={col} className="px-2 py-1 text-left font-semibold text-gray-400 whitespace-nowrap">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {section.values.map((row, ri) => (
                      <tr key={ri} className="border-b border-gray-700 last:border-0">
                        {row.map((val: any, ci: number) => (
                          <td key={ci} className="px-2 py-1 text-gray-300 font-mono whitespace-nowrap">{String(val ?? '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SystemHealth() {
  // Server info (from SHOW DIAGNOSTICS)
  const [serverInfo, setServerInfo] = useState<Partial<ServerInfo>>({});
  const [serverInfoLoading, setServerInfoLoading] = useState(true);

  // Performance metrics history (up to 60 points)
  const [metrics, setMetrics] = useState<MetricPoint[]>([]);

  // Running queries
  const [runningQueries, setRunningQueries] = useState<RunningQuery[]>([]);
  const [killingId, setKillingId] = useState<number | string | null>(null);

  // Shard groups
  const [shardGroups, setShardGroups] = useState<ShardGroup[]>([]);
  const [shardGroupsLoading, setShardGroupsLoading] = useState(true);
  const [sgPage, setSgPage] = useState(0);
  const sgPerPage = 25;

  // Last updated timestamp and error state
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState('');

  // Structured diagnostics/stats
  const [diagSections, setDiagSections] = useState<DiagnosticSection[]>([]);
  const [statSections, setStatSections] = useState<DiagnosticSection[]>([]);
  const [diagLoading, setDiagLoading] = useState(false);
  const [statsDetailLoading, setStatsDetailLoading] = useState(false);

  // Backup
  const [backupLoading, setBackupLoading] = useState(false);

  // Ref to track previous raw stat values for delta computation
  const prevStatsRef = useRef<{ pointsWritten: number; queriesExecuted: number } | null>(null);

  // ── Fetch server info (once on mount) ──────────────────────────────────────

  const fetchServerInfo = useCallback(async () => {
    setServerInfoLoading(true);
    try {
      const result = await client.getDiagnostics();
      const info = parseDiagnosticsSystem(result);
      // Also try to get version from ping
      try {
        const pingResult = await client.ping();
        if (pingResult.version && pingResult.version !== 'unknown') {
          info.version = pingResult.version;
        }
      } catch {
        // ignore ping errors
      }
      setServerInfo(info);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load diagnostics.');
    } finally {
      setServerInfoLoading(false);
    }
  }, []);

  // ── Fetch stats (periodic) ─────────────────────────────────────────────────

  const fetchStats = useCallback(async () => {
    try {
      const result = await client.getStats();
      const rawPointsWritten = extractStat(result, 'httpd', 'pointsWrittenOK');
      const rawQueriesExecuted = extractStat(result, 'httpd', 'queryReq');

      const prev = prevStatsRef.current;
      const pointsWrittenDelta = prev ? Math.max(0, rawPointsWritten - prev.pointsWritten) : 0;
      const queriesExecutedDelta = prev ? Math.max(0, rawQueriesExecuted - prev.queriesExecuted) : 0;
      prevStatsRef.current = { pointsWritten: rawPointsWritten, queriesExecuted: rawQueriesExecuted };

      const now = new Date();
      const point: MetricPoint = {
        time: formatTime(now),
        pointsWritten: pointsWrittenDelta,
        queriesExecuted: queriesExecutedDelta,
      };

      setMetrics((prev) => {
        const updated = [...prev, point];
        return updated.length > 60 ? updated.slice(updated.length - 60) : updated;
      });
      setLastUpdated(now);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load stats.');
    }
  }, []);

  // ── Fetch running queries (periodic) ──────────────────────────────────────

  const fetchRunningQueries = useCallback(async () => {
    try {
      const raw = await client.getRunningQueries();
      const queries: RunningQuery[] = raw.map((q: any) => ({
        qid: q.qid ?? q.id ?? '',
        database: q.database ?? q.db ?? '',
        query: q.query ?? '',
        duration: q.duration ?? '',
      }));
      setRunningQueries(queries);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load running queries.');
    }
  }, []);

  // ── Fetch shard groups (once on mount) ────────────────────────────────────

  const fetchShardGroups = useCallback(async () => {
    setShardGroupsLoading(true);
    try {
      const raw = await client.getShardGroups();
      const groups: ShardGroup[] = raw.map((sg: any) => ({
        id: sg.id ?? sg.shardGroupID ?? '',
        database: sg.database ?? sg.db ?? '',
        retentionPolicy: sg.retentionPolicy ?? sg.rp ?? sg.retention_policy ?? '',
        startTime: sg.startTime ?? sg.start_time ?? sg.start ?? '',
        endTime: sg.endTime ?? sg.end_time ?? sg.end ?? '',
        expiryTime: sg.expiryTime ?? sg.expiry_time ?? sg.expiry ?? '',
      }));
      setShardGroups(groups);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load shard groups.');
    } finally {
      setShardGroupsLoading(false);
    }
  }, []);

  // ── Kill a running query ───────────────────────────────────────────────────

  const handleKillQuery = async (id: number | string) => {
    setKillingId(id);
    try {
      await client.killQuery(Number(id));
      await fetchRunningQueries();
    } catch (err: any) {
      setError(err?.message ?? `Failed to kill query ${id}.`);
    } finally {
      setKillingId(null);
    }
  };

  // ── Fetch structured diagnostics ────────────────────────────────────────

  const fetchDiagnosticsDetail = useCallback(async () => {
    setDiagLoading(true);
    try {
      const result = await client.getDiagnostics();
      setDiagSections(parseDiagnosticSections(result));
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load diagnostics.');
    } finally {
      setDiagLoading(false);
    }
  }, []);

  const fetchStatsDetail = useCallback(async () => {
    setStatsDetailLoading(true);
    try {
      const result = await client.getStats();
      setStatSections(parseDiagnosticSections(result));
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load stats.');
    } finally {
      setStatsDetailLoading(false);
    }
  }, []);

  const handleBackup = async () => {
    setBackupLoading(true);
    try {
      const blob = await client.backup();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tidedb-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.tar.gz`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err?.message ?? 'Backup failed.');
    } finally {
      setBackupLoading(false);
    }
  };

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchServerInfo();
    fetchShardGroups();
  }, [fetchServerInfo, fetchShardGroups]);

  // Re-fetch everything when connection changes
  useEffect(() => {
    const handler = () => {
      prevStatsRef.current = null;
      setMetrics([]);
      setDiagSections([]);
      setStatSections([]);
      setError('');
      fetchServerInfo();
      fetchShardGroups();
    };
    window.addEventListener('tidedb-connection-change', handler);
    return () => window.removeEventListener('tidedb-connection-change', handler);
  }, [fetchServerInfo, fetchShardGroups]);

  // Initial fetch and 5-second interval for stats + queries
  useEffect(() => {
    fetchStats();
    fetchRunningQueries();

    const interval = setInterval(() => {
      fetchStats();
      fetchRunningQueries();
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchStats, fetchRunningQueries]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-full bg-gray-950 text-gray-100">
      {/* Page header */}
      <div className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-100 flex items-center gap-2">
            <Activity className="w-6 h-6 text-blue-400" />
            System Health
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Live diagnostics, performance metrics, and active queries.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-gray-500 flex items-center gap-1.5">
              <RefreshCw className="w-3 h-3" />
              Last updated: {formatTime(lastUpdated)}
            </span>
          )}
        </div>
      </div>

      <div className="px-6 py-5 flex flex-col gap-8">
        {/* Error banner */}
        {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}

        {/* ── Section 1: Server Info Cards ── */}
        <section>
          <SectionHeading
            icon={<Server className="w-5 h-5" />}
            title="Server Information"
          />
          {serverInfoLoading ? (
            <div className="flex items-center gap-2 text-gray-500 text-sm py-4">
              <svg
                className="w-4 h-4 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8H4z"
                />
              </svg>
              Loading server info...
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              <InfoCard
                icon={<Activity className="w-3.5 h-3.5" />}
                label="Version"
                value={serverInfo.version && serverInfo.version !== 'unknown' ? serverInfo.version : '—'}
              />
              <InfoCard
                icon={<Clock className="w-3.5 h-3.5" />}
                label="Uptime"
                value={serverInfo.uptime ?? ''}
              />
              <InfoCard
                icon={<Cpu className="w-3.5 h-3.5" />}
                label="Go Version"
                value={serverInfo.goVersion ?? ''}
              />
              <InfoCard
                icon={<Server className="w-3.5 h-3.5" />}
                label="OS / Arch"
                value={
                  serverInfo.os && serverInfo.arch
                    ? `${serverInfo.os} / ${serverInfo.arch}`
                    : serverInfo.os ?? serverInfo.arch ?? ''
                }
              />
              <InfoCard
                icon={<HardDrive className="w-3.5 h-3.5" />}
                label="PID"
                value={serverInfo.pid ?? ''}
              />
            </div>
          )}
        </section>

        {/* ── Section 2: Performance Metrics Charts ── */}
        <section>
          <SectionHeading
            icon={<Activity className="w-5 h-5" />}
            title="Performance Metrics"
            subtitle="(auto-refresh every 5s, last 60 samples)"
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Points Written */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                Points Written / interval
              </p>
              {metrics.length === 0 ? (
                <div className="flex items-center justify-center h-40 text-gray-600 text-sm">
                  Collecting data...
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart
                    data={metrics}
                    margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis
                      dataKey="time"
                      tick={{ fill: '#9ca3af', fontSize: 10 }}
                      tickLine={false}
                      axisLine={{ stroke: '#374151' }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fill: '#9ca3af', fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="pointsWritten"
                      name="Points Written"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: '#3b82f6' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Queries Executed */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                Queries Executed / interval
              </p>
              {metrics.length === 0 ? (
                <div className="flex items-center justify-center h-40 text-gray-600 text-sm">
                  Collecting data...
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart
                    data={metrics}
                    margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis
                      dataKey="time"
                      tick={{ fill: '#9ca3af', fontSize: 10 }}
                      tickLine={false}
                      axisLine={{ stroke: '#374151' }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fill: '#9ca3af', fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="queriesExecuted"
                      name="Queries Executed"
                      stroke="#22c55e"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: '#22c55e' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </section>

        {/* ── Section 3: Active Queries ── */}
        <section>
          <SectionHeading
            icon={<Activity className="w-5 h-5" />}
            title="Active Queries"
            subtitle="(auto-refresh every 5s)"
          />
          <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            {runningQueries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-600">
                <Activity className="w-8 h-8 mb-3 opacity-30" />
                <p className="text-sm">No active queries.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-gray-800 border-b border-gray-700">
                      <th className="px-4 py-3 text-left font-semibold text-gray-400 whitespace-nowrap w-20">
                        Query ID
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-400 whitespace-nowrap w-36">
                        Database
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-400">
                        Query
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-400 whitespace-nowrap w-32">
                        Duration
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-400 whitespace-nowrap w-24">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {runningQueries.map((q) => (
                      <tr
                        key={q.qid}
                        className="border-b border-gray-700 last:border-0 hover:bg-gray-700/30 transition-colors duration-150"
                      >
                        <td className="px-4 py-3 font-mono text-gray-300 text-xs">
                          {String(q.qid)}
                        </td>
                        <td className="px-4 py-3 font-mono text-blue-300 text-xs whitespace-nowrap">
                          {q.database || <span className="text-gray-600">—</span>}
                        </td>
                        <td className="px-4 py-3 font-mono text-gray-200 text-xs break-all max-w-xs">
                          <span className="whitespace-pre-wrap leading-relaxed">{q.query}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs font-mono whitespace-nowrap">
                          {q.duration || <span className="text-gray-600">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleKillQuery(q.qid)}
                            disabled={killingId === q.qid}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors duration-150 disabled:opacity-50 whitespace-nowrap"
                          >
                            {killingId === q.qid ? (
                              <svg
                                className="w-3 h-3 animate-spin"
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                              >
                                <circle
                                  className="opacity-25"
                                  cx="12"
                                  cy="12"
                                  r="10"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                />
                                <path
                                  className="opacity-75"
                                  fill="currentColor"
                                  d="M4 12a8 8 0 018-8v8H4z"
                                />
                              </svg>
                            ) : (
                              <XCircle className="w-3 h-3" />
                            )}
                            Kill
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* ── Section 4: Shard Groups ── */}
        <section>
          <SectionHeading
            icon={<HardDrive className="w-5 h-5" />}
            title="Shard Groups"
          />
          <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            {shardGroupsLoading ? (
              <div className="flex items-center gap-2 text-gray-500 text-sm px-4 py-6">
                <svg
                  className="w-4 h-4 animate-spin"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
                Loading shard groups...
              </div>
            ) : shardGroups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-600">
                <HardDrive className="w-8 h-8 mb-3 opacity-30" />
                <p className="text-sm">No shard groups found.</p>
              </div>
            ) : (() => {
              const totalPages = Math.ceil(shardGroups.length / sgPerPage);
              const page = Math.min(sgPage, totalPages - 1);
              const pageItems = shardGroups.slice(page * sgPerPage, (page + 1) * sgPerPage);

              return (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="bg-gray-800 border-b border-gray-700">
                          <th className="px-4 py-3 text-left font-semibold text-gray-400 whitespace-nowrap w-16">
                            ID
                          </th>
                          <th className="px-4 py-3 text-left font-semibold text-gray-400 whitespace-nowrap">
                            Database
                          </th>
                          <th className="px-4 py-3 text-left font-semibold text-gray-400 whitespace-nowrap">
                            Retention Policy
                          </th>
                          <th className="px-4 py-3 text-left font-semibold text-gray-400 whitespace-nowrap">
                            Start Time
                          </th>
                          <th className="px-4 py-3 text-left font-semibold text-gray-400 whitespace-nowrap">
                            End Time
                          </th>
                          <th className="px-4 py-3 text-left font-semibold text-gray-400 whitespace-nowrap">
                            Expiry Time
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageItems.map((sg, idx) => (
                          <tr
                            key={`${sg.id}-${idx}`}
                            className="border-b border-gray-700 last:border-0 hover:bg-gray-700/30 transition-colors duration-150"
                          >
                            <td className="px-4 py-3 font-mono text-gray-300 text-xs">
                              {String(sg.id)}
                            </td>
                            <td className="px-4 py-3 font-mono text-blue-300 text-xs whitespace-nowrap">
                              {sg.database || <span className="text-gray-600">—</span>}
                            </td>
                            <td className="px-4 py-3 font-mono text-gray-300 text-xs whitespace-nowrap">
                              {sg.retentionPolicy || <span className="text-gray-600">—</span>}
                            </td>
                            <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                              {formatTimestamp(sg.startTime)}
                            </td>
                            <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                              {formatTimestamp(sg.endTime)}
                            </td>
                            <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                              {formatTimestamp(sg.expiryTime)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700">
                      <span className="text-xs text-gray-500">
                        {shardGroups.length.toLocaleString()} shard groups — page {page + 1} of {totalPages}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setSgPage(0)}
                          disabled={page === 0}
                          className="px-2 py-1 text-xs text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          First
                        </button>
                        <button
                          onClick={() => setSgPage((p) => Math.max(0, p - 1))}
                          disabled={page === 0}
                          className="p-1 text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <button
                          onClick={() => setSgPage((p) => Math.min(totalPages - 1, p + 1))}
                          disabled={page >= totalPages - 1}
                          className="p-1 text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <ChevronRight size={14} />
                        </button>
                        <button
                          onClick={() => setSgPage(totalPages - 1)}
                          disabled={page >= totalPages - 1}
                          className="px-2 py-1 text-xs text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          Last
                        </button>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </section>

        {/* ── Section 5: Structured Diagnostics ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-blue-400"><FileText className="w-5 h-5" /></span>
              <h2 className="text-base font-semibold text-gray-200">SHOW DIAGNOSTICS</h2>
              <span className="text-xs text-gray-500">(all sections)</span>
            </div>
            <button onClick={fetchDiagnosticsDetail} disabled={diagLoading}
              className="flex items-center gap-2 px-3 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors duration-150 disabled:opacity-50">
              {diagLoading ? (
                <svg className="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : <RefreshCw className="w-4 h-4" />}
              {diagSections.length > 0 ? 'Refresh' : 'Load'}
            </button>
          </div>
          {diagSections.length === 0 && !diagLoading && (
            <div className="text-center py-8 text-gray-500 text-sm">Click "Load" to view all diagnostic sections.</div>
          )}
          {diagLoading && (
            <div className="flex items-center justify-center py-8 text-gray-500">
              <svg className="w-5 h-5 animate-spin mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Loading diagnostics...
            </div>
          )}
          {diagSections.length > 0 && !diagLoading && (
            <div className="flex flex-col gap-2">
              {diagSections.map((section) => (
                <DiagnosticCard key={section.name} section={section} />
              ))}
            </div>
          )}
        </section>

        {/* ── Section 6: Structured Stats ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-blue-400"><BarChart3 className="w-5 h-5" /></span>
              <h2 className="text-base font-semibold text-gray-200">SHOW STATS</h2>
              <span className="text-xs text-gray-500">(all modules)</span>
            </div>
            <button onClick={fetchStatsDetail} disabled={statsDetailLoading}
              className="flex items-center gap-2 px-3 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors duration-150 disabled:opacity-50">
              {statsDetailLoading ? (
                <svg className="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : <RefreshCw className="w-4 h-4" />}
              {statSections.length > 0 ? 'Refresh' : 'Load'}
            </button>
          </div>
          {statSections.length === 0 && !statsDetailLoading && (
            <div className="text-center py-8 text-gray-500 text-sm">Click "Load" to view all stats modules.</div>
          )}
          {statsDetailLoading && (
            <div className="flex items-center justify-center py-8 text-gray-500">
              <svg className="w-5 h-5 animate-spin mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Loading stats...
            </div>
          )}
          {statSections.length > 0 && !statsDetailLoading && (
            <div className="flex flex-col gap-2">
              {statSections.map((section, idx) => (
                <DiagnosticCard key={`${section.name}-${idx}`} section={section} />
              ))}
            </div>
          )}
        </section>

        {/* ── Section 7: Backup ── */}
        <section>
          <SectionHeading
            icon={<Download className="w-5 h-5" />}
            title="Backup"
          />
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
            <p className="text-sm text-gray-400 mb-3">
              Download a portable backup snapshot via the debug endpoint. This creates a tar.gz archive of the current data.
            </p>
            <button onClick={handleBackup} disabled={backupLoading}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors duration-150 disabled:opacity-50">
              {backupLoading ? (
                <svg className="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : <Download className="w-4 h-4" />}
              {backupLoading ? 'Downloading...' : 'Download Backup'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
