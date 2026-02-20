// Static playground pages that render mock data for all non-query pages.
// These show realistic pre-populated data for each backend type.

import { useState } from 'react';
import { AlertTriangle, CheckCircle, XCircle, Info } from 'lucide-react';
import {
  PROM_TARGETS, PROM_RULES, PROM_TSDB_STATUS, PROM_CONFIG,
  PROM_METRIC_NAMES, PROM_METADATA,
  VM_ACTIVE_QUERIES, VM_TOP_QUERIES, VM_TSDB_STATUS, VM_SNAPSHOTS,
  INFLUX_DATABASES, INFLUX_RETENTION_POLICIES, INFLUX_USERS, INFLUX_CONTINUOUS_QUERIES,
} from '../../api/playground/mockData';
import { usePlayground } from '../../api/playground/PlaygroundContext';

function PlaygroundNotice({ feature }: { feature: string }) {
  return (
    <div className="bg-amber-900/20 border border-amber-700/50 rounded-lg p-3 mb-4 flex items-start gap-2">
      <Info size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
      <p className="text-xs text-amber-300/90">
        <strong>Playground Mode:</strong> {feature} operations are read-only with sample data.
        To use write/admin features, run the binary with your actual database connection.
      </p>
    </div>
  );
}

// ── InfluxDB Admin ──────────────────────────────────────────────────────────

export function PlaygroundInfluxAdmin() {
  const [tab, setTab] = useState<'dbs' | 'cqs' | 'users'>('dbs');

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <h1 className="text-xl font-bold text-white">Database Admin</h1>
      <PlaygroundNotice feature="Create/drop database and user management" />

      <div className="flex gap-2 mb-4">
        {(['dbs', 'cqs', 'users'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${tab === t ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
            {t === 'dbs' ? 'Databases' : t === 'cqs' ? 'Continuous Queries' : 'Users'}
          </button>
        ))}
      </div>

      {tab === 'dbs' && (
        <div className="space-y-3">
          {INFLUX_DATABASES.map((db) => {
            const rps = INFLUX_RETENTION_POLICIES[db] || [];
            return (
              <div key={db} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-white mb-2">{db}</h3>
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-gray-700">
                    <th className="text-left px-2 py-1 text-gray-400">Retention Policy</th>
                    <th className="text-left px-2 py-1 text-gray-400">Duration</th>
                    <th className="text-left px-2 py-1 text-gray-400">Shard Duration</th>
                    <th className="text-left px-2 py-1 text-gray-400">Replica</th>
                    <th className="text-left px-2 py-1 text-gray-400">Default</th>
                  </tr></thead>
                  <tbody>
                    {rps.map((rp: any) => (
                      <tr key={rp.name} className="border-b border-gray-800/50">
                        <td className="px-2 py-1.5 text-gray-200 font-mono">{rp.name}</td>
                        <td className="px-2 py-1.5 text-gray-300">{rp.duration === '0s' ? 'INF' : rp.duration}</td>
                        <td className="px-2 py-1.5 text-gray-300">{rp.shardGroupDuration}</td>
                        <td className="px-2 py-1.5 text-gray-300">{rp.replicaN}</td>
                        <td className="px-2 py-1.5">{rp.default ? <CheckCircle size={12} className="text-green-400" /> : <span className="text-gray-600">-</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'cqs' && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          {INFLUX_CONTINUOUS_QUERIES.map((cq: any) => (
            <div key={cq.name} className="mb-3">
              <h3 className="text-xs font-semibold text-gray-400 mb-1">{cq.name}</h3>
              {cq.values.length === 0 ? (
                <p className="text-xs text-gray-600">No continuous queries</p>
              ) : (
                cq.values.map((v: any[], i: number) => (
                  <div key={i} className="bg-gray-800 rounded p-2 mb-1">
                    <span className="text-xs text-blue-400 font-medium">{v[0]}</span>
                    <pre className="text-[10px] text-gray-400 font-mono mt-1 whitespace-pre-wrap">{v[1]}</pre>
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'users' && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-gray-700">
              <th className="text-left px-2 py-1 text-gray-400">Username</th>
              <th className="text-left px-2 py-1 text-gray-400">Admin</th>
            </tr></thead>
            <tbody>
              {INFLUX_USERS.map((u) => (
                <tr key={u.user} className="border-b border-gray-800/50">
                  <td className="px-2 py-1.5 text-gray-200 font-mono">{u.user}</td>
                  <td className="px-2 py-1.5">{u.admin ? <CheckCircle size={12} className="text-green-400" /> : <XCircle size={12} className="text-gray-600" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── InfluxDB Write (playground notice) ──────────────────────────────────────

export function PlaygroundInfluxWrite() {
  const [lineData, setLineData] = useState('cpu,host=web-01 usage_user=42.5,usage_system=8.2 1609459200000000000');
  const [written, setWritten] = useState(false);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <h1 className="text-xl font-bold text-white">Write Data</h1>
      <PlaygroundNotice feature="Write" />
      <div className="space-y-3">
        <div>
          <label className="text-xs text-gray-400 block mb-1">Database</label>
          <select className="bg-gray-800 border border-gray-700 rounded text-xs text-gray-300 px-2 py-1.5">
            {INFLUX_DATABASES.map((db) => <option key={db}>{db}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Line Protocol Data</label>
          <textarea
            value={lineData}
            onChange={(e) => setLineData(e.target.value)}
            rows={6}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm font-mono text-gray-200 focus:outline-none focus:border-blue-500"
          />
        </div>
        <button
          onClick={() => setWritten(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium transition-colors"
        >
          Write (Simulated)
        </button>
        {written && (
          <div className="bg-green-900/30 border border-green-700/50 rounded p-3 text-xs text-green-300">
            <CheckCircle size={12} className="inline mr-1" />
            Simulated write accepted. In production, this would write to your actual InfluxDB instance.
          </div>
        )}
      </div>
    </div>
  );
}

// ── InfluxDB System Health ──────────────────────────────────────────────────

export function PlaygroundInfluxHealth() {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <h1 className="text-xl font-bold text-white">System Health</h1>
      <PlaygroundNotice feature="System health monitoring" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <div className="text-xs text-gray-500 mb-1">Version</div>
          <div className="text-lg font-semibold text-white">1.8.10</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <div className="text-xs text-gray-500 mb-1">Uptime</div>
          <div className="text-lg font-semibold text-white">72h 15m</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <div className="text-xs text-gray-500 mb-1">Total Series</div>
          <div className="text-lg font-semibold text-white">4,287</div>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Runtime Stats</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div><span className="text-gray-500">Queries Executed</span><div className="text-white font-mono mt-0.5">47,821</div></div>
          <div><span className="text-gray-500">Points Written</span><div className="text-white font-mono mt-0.5">2,847,193</div></div>
          <div><span className="text-gray-500">Write Requests</span><div className="text-white font-mono mt-0.5">9,481</div></div>
          <div><span className="text-gray-500">GOMAXPROCS</span><div className="text-white font-mono mt-0.5">4</div></div>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Database Stats</h3>
        <table className="w-full text-xs">
          <thead><tr className="border-b border-gray-700">
            <th className="text-left px-2 py-1 text-gray-400">Database</th>
            <th className="text-left px-2 py-1 text-gray-400">Measurements</th>
            <th className="text-left px-2 py-1 text-gray-400">Series</th>
          </tr></thead>
          <tbody>
            <tr className="border-b border-gray-800/50"><td className="px-2 py-1.5 text-gray-200">telegraf</td><td className="px-2 py-1.5 text-gray-300">7</td><td className="px-2 py-1.5 text-gray-300">3,142</td></tr>
            <tr className="border-b border-gray-800/50"><td className="px-2 py-1.5 text-gray-200">app_metrics</td><td className="px-2 py-1.5 text-gray-300">4</td><td className="px-2 py-1.5 text-gray-300">847</td></tr>
            <tr className="border-b border-gray-800/50"><td className="px-2 py-1.5 text-gray-200">iot_sensors</td><td className="px-2 py-1.5 text-gray-300">4</td><td className="px-2 py-1.5 text-gray-300">298</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Prometheus/VM Targets ───────────────────────────────────────────────────

export function PlaygroundTargets() {
  const targets = PROM_TARGETS.data.activeTargets;
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <h1 className="text-xl font-bold text-white">Targets</h1>
      <PlaygroundNotice feature="Target management" />
      <div className="grid gap-3">
        {targets.map((t, i) => (
          <div key={i} className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {t.health === 'up' ? (
                <CheckCircle size={16} className="text-green-400" />
              ) : (
                <XCircle size={16} className="text-red-400" />
              )}
              <div>
                <div className="text-sm font-medium text-white">{t.labels.instance}</div>
                <div className="text-xs text-gray-400">Job: {t.labels.job} &middot; Pool: {t.scrapePool}</div>
              </div>
            </div>
            <div className="text-right text-xs">
              <div className="text-gray-400">{t.scrapeInterval} interval</div>
              <div className="text-gray-500">Last: {t.lastScrapeDuration.toFixed(3)}s ago</div>
              {t.lastError && <div className="text-red-400 mt-0.5">{t.lastError}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Prometheus/VM Alert Rules ───────────────────────────────────────────────

export function PlaygroundAlertRules() {
  const groups = PROM_RULES.data.groups;
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <h1 className="text-xl font-bold text-white">Alert Rules</h1>
      <PlaygroundNotice feature="Alert rule management" />
      {groups.map((g) => (
        <div key={g.name} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-white mb-2">{g.name} <span className="text-xs text-gray-500 font-normal">{g.file}</span></h3>
          <div className="space-y-2">
            {g.rules.map((r: any, i: number) => (
              <div key={i} className="bg-gray-800 rounded p-3">
                <div className="flex items-center gap-2 mb-1">
                  {r.type === 'alerting' && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      r.state === 'firing' ? 'bg-red-600/30 text-red-300' :
                      r.state === 'pending' ? 'bg-yellow-600/30 text-yellow-300' :
                      'bg-green-600/30 text-green-300'
                    }`}>
                      {r.state?.toUpperCase() || 'INACTIVE'}
                    </span>
                  )}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${r.type === 'alerting' ? 'bg-orange-600/20 text-orange-300' : 'bg-blue-600/20 text-blue-300'}`}>
                    {r.type}
                  </span>
                  <span className="text-sm font-medium text-white">{r.name}</span>
                </div>
                <pre className="text-[11px] text-gray-400 font-mono">{r.query}</pre>
                {r.alerts && r.alerts.length > 0 && (
                  <div className="mt-2 text-xs text-red-300">
                    <AlertTriangle size={10} className="inline mr-1" />
                    {r.alerts.length} active alert(s)
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Prometheus/VM TSDB Status ───────────────────────────────────────────────

export function PlaygroundTsdbStatus() {
  const { backendType } = usePlayground();
  const isVM = backendType === 'victoriametrics';
  const data = isVM ? VM_TSDB_STATUS.data : PROM_TSDB_STATUS.data;
  const headStats = (data as any).headStats;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <h1 className="text-xl font-bold text-white">TSDB Status</h1>
      <PlaygroundNotice feature="TSDB" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {isVM ? (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <div className="text-xs text-gray-500">Total Series</div>
            <div className="text-xl font-semibold text-white">{(VM_TSDB_STATUS.data.totalSeries || 0).toLocaleString()}</div>
          </div>
        ) : headStats ? (
          <>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <div className="text-xs text-gray-500">Head Series</div>
              <div className="text-xl font-semibold text-white">{headStats.numSeries.toLocaleString()}</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <div className="text-xs text-gray-500">Label Pairs</div>
              <div className="text-xl font-semibold text-white">{headStats.numLabelPairs.toLocaleString()}</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <div className="text-xs text-gray-500">Chunks</div>
              <div className="text-xl font-semibold text-white">{headStats.chunkCount.toLocaleString()}</div>
            </div>
          </>
        ) : null}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-white mb-2">Top Series by Metric Name</h3>
        <table className="w-full text-xs">
          <thead><tr className="border-b border-gray-700">
            <th className="text-left px-2 py-1 text-gray-400">Metric</th>
            <th className="text-right px-2 py-1 text-gray-400">Series Count</th>
          </tr></thead>
          <tbody>
            {data.seriesCountByMetricName.map((e: any) => (
              <tr key={e.name} className="border-b border-gray-800/50">
                <td className="px-2 py-1.5 text-gray-200 font-mono">{e.name}</td>
                <td className="px-2 py-1.5 text-gray-300 text-right">{e.value.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-white mb-2">Label Value Count by Label</h3>
        <table className="w-full text-xs">
          <thead><tr className="border-b border-gray-700">
            <th className="text-left px-2 py-1 text-gray-400">Label</th>
            <th className="text-right px-2 py-1 text-gray-400">Value Count</th>
          </tr></thead>
          <tbody>
            {data.labelValueCountByLabelName.map((e: any) => (
              <tr key={e.name} className="border-b border-gray-800/50">
                <td className="px-2 py-1.5 text-gray-200 font-mono">{e.name}</td>
                <td className="px-2 py-1.5 text-gray-300 text-right">{e.value.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Prometheus/VM Metrics Explorer ──────────────────────────────────────────

export function PlaygroundMetrics() {
  const [search, setSearch] = useState('');
  const filtered = PROM_METRIC_NAMES.filter((m) =>
    !search || m.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <h1 className="text-xl font-bold text-white">Metrics Explorer</h1>
      <PlaygroundNotice feature="Metrics exploration" />
      <input
        type="text"
        placeholder="Filter metrics..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
      />
      <div className="space-y-1">
        {filtered.map((m) => {
          const meta = PROM_METADATA[m];
          return (
            <div key={m} className="bg-gray-900 border border-gray-800 rounded p-3 flex items-center justify-between">
              <span className="font-mono text-sm text-gray-200">{m}</span>
              {meta && (
                <div className="text-xs text-gray-500">
                  <span className="bg-gray-800 px-1.5 py-0.5 rounded">{meta[0].type}</span>
                  {meta[0].help && <span className="ml-2">{meta[0].help}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-500">{filtered.length} of {PROM_METRIC_NAMES.length} metrics</p>
    </div>
  );
}

// ── Prometheus/VM Config ────────────────────────────────────────────────────

export function PlaygroundConfig() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <h1 className="text-xl font-bold text-white">Configuration</h1>
      <PlaygroundNotice feature="Configuration viewing" />
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <pre className="text-xs font-mono text-gray-300 whitespace-pre-wrap">{PROM_CONFIG.data.yaml}</pre>
      </div>
    </div>
  );
}

// ── VM Active Queries ───────────────────────────────────────────────────────

export function PlaygroundVmActiveQueries() {
  const queries = VM_ACTIVE_QUERIES.data;
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <h1 className="text-xl font-bold text-white">Active Queries</h1>
      <PlaygroundNotice feature="Query management" />
      <table className="w-full text-xs">
        <thead><tr className="border-b border-gray-700">
          <th className="text-left px-2 py-1 text-gray-400">ID</th>
          <th className="text-left px-2 py-1 text-gray-400">Query</th>
          <th className="text-left px-2 py-1 text-gray-400">Duration</th>
          <th className="text-left px-2 py-1 text-gray-400">Remote</th>
        </tr></thead>
        <tbody>
          {queries.map((q) => (
            <tr key={q.id} className="border-b border-gray-800/50">
              <td className="px-2 py-1.5 text-gray-300">{q.id}</td>
              <td className="px-2 py-1.5 text-gray-200 font-mono">{q.query}</td>
              <td className="px-2 py-1.5 text-gray-400">{q.duration}</td>
              <td className="px-2 py-1.5 text-gray-500">{q.remote_addr}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="text-lg font-semibold text-white mt-6">Top Queries</h2>
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h3 className="text-xs font-semibold text-gray-400 mb-2">By Count</h3>
        {VM_TOP_QUERIES.data.topByCount.map((q, i) => (
          <div key={i} className="flex items-center justify-between py-1 border-b border-gray-800/50">
            <span className="text-xs font-mono text-gray-300 truncate flex-1">{q.query}</span>
            <span className="text-xs text-gray-400 ml-2">{q.count} calls</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── VM Snapshots ────────────────────────────────────────────────────────────

export function PlaygroundVmSnapshots() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <h1 className="text-xl font-bold text-white">Snapshots</h1>
      <PlaygroundNotice feature="Snapshot creation/deletion" />
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-2">
        {VM_SNAPSHOTS.map((s) => (
          <div key={s} className="flex items-center justify-between bg-gray-800 rounded p-3">
            <span className="text-sm font-mono text-gray-200">{s}</span>
            <span className="text-xs text-gray-500">Read-only in playground</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── VM Export/Import ────────────────────────────────────────────────────────

export function PlaygroundVmExportImport() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <h1 className="text-xl font-bold text-white">Export / Import</h1>
      <PlaygroundNotice feature="Data export and import" />
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <p className="text-sm text-gray-400">
          In production, this page lets you export data in JSON, CSV, or native format
          and import data from various sources. Connect a real VictoriaMetrics instance
          to use this feature.
        </p>
      </div>
    </div>
  );
}

// ── VM Admin ────────────────────────────────────────────────────────────────

export function PlaygroundVmAdmin() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <h1 className="text-xl font-bold text-white">Admin Operations</h1>
      <PlaygroundNotice feature="Admin operations (force merge, cache reset, series deletion)" />
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <div className="grid gap-3">
          <div className="bg-gray-800 rounded p-3">
            <h3 className="text-sm font-medium text-white mb-1">Force Merge</h3>
            <p className="text-xs text-gray-400">Triggers immediate compaction of data files. Disabled in playground.</p>
          </div>
          <div className="bg-gray-800 rounded p-3">
            <h3 className="text-sm font-medium text-white mb-1">Reset Rollup Cache</h3>
            <p className="text-xs text-gray-400">Clears the rollup result cache. Disabled in playground.</p>
          </div>
          <div className="bg-gray-800 rounded p-3">
            <h3 className="text-sm font-medium text-white mb-1">Delete Series</h3>
            <p className="text-xs text-gray-400">Deletes time series matching a selector. Disabled in playground.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Prometheus Service Discovery ─────────────────────────────────────────────

export function PlaygroundServiceDiscovery() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <h1 className="text-xl font-bold text-white">Service Discovery</h1>
      <PlaygroundNotice feature="Service discovery" />
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <div className="space-y-2">
          <div className="bg-gray-800 rounded p-3">
            <h3 className="text-sm font-medium text-white">prometheus</h3>
            <p className="text-xs text-gray-400 mt-1">Static config &middot; 1 target: localhost:9090</p>
          </div>
          <div className="bg-gray-800 rounded p-3">
            <h3 className="text-sm font-medium text-white">node</h3>
            <p className="text-xs text-gray-400 mt-1">Static config &middot; 3 targets: web-01:9100, web-02:9100, db-01:9100</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Prometheus Alertmanager ──────────────────────────────────────────────────

export function PlaygroundAlertmanager() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <h1 className="text-xl font-bold text-white">Alertmanager</h1>
      <PlaygroundNotice feature="Alertmanager integration" />
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <p className="text-sm text-gray-400">
          No Alertmanager connected in playground mode. In production, this page shows
          active alerts, silences, and lets you create/manage silences.
        </p>
      </div>
    </div>
  );
}
