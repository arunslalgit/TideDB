import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Plus, Trash2 } from 'lucide-react';
import { useActiveConnection } from '../../hooks/useActiveConnection';
import prometheusClient from '../../api/prometheus';
import type { AlertmanagerAlert, AlertmanagerSilence } from '../../api/prometheus';

type Tab = 'alerts' | 'silences' | 'status';

export default function PromAlertmanager() {
  const { connection, auth } = useActiveConnection();
  const [tab, setTab] = useState<Tab>('alerts');
  const [alerts, setAlerts] = useState<AlertmanagerAlert[]>([]);
  const [silences, setSilences] = useState<AlertmanagerSilence[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Silence form
  const [showSilenceForm, setShowSilenceForm] = useState(false);
  const [silenceName, setSilenceName] = useState('');
  const [silenceValue, setSilenceValue] = useState('');
  const [silenceIsRegex, setSilenceIsRegex] = useState(false);
  const [silenceDuration, setSilenceDuration] = useState('2h');
  const [silenceComment, setSilenceComment] = useState('');
  const [silenceCreator] = useState('timeseriesui');

  const amUrl = connection?.alertmanagerUrl;

  const fetchData = useCallback(async () => {
    if (!amUrl) return;
    setLoading(true);
    setError(null);
    try {
      const [alertsResp, silencesResp, statusResp] = await Promise.allSettled([
        prometheusClient.getAMAlerts(amUrl, auth),
        prometheusClient.getAMSilences(amUrl, auth),
        prometheusClient.getAMStatus(amUrl, auth),
      ]);
      if (alertsResp.status === 'fulfilled') setAlerts(alertsResp.value || []);
      if (silencesResp.status === 'fulfilled') setSilences((silencesResp.value || []).filter((s: AlertmanagerSilence) => s.status.state !== 'expired'));
      if (statusResp.status === 'fulfilled') setStatus(statusResp.value);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [amUrl, auth]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const createSilence = async () => {
    if (!amUrl || !silenceName.trim()) return;
    try {
      const now = new Date();
      const durationMs = parseDuration(silenceDuration);
      const endsAt = new Date(now.getTime() + durationMs);

      await prometheusClient.createAMSilence(amUrl, {
        matchers: [{ name: silenceName, value: silenceValue, isRegex: silenceIsRegex, isEqual: true }],
        startsAt: now.toISOString(),
        endsAt: endsAt.toISOString(),
        createdBy: silenceCreator,
        comment: silenceComment || 'Created by TimeseriesUI',
      }, auth);

      setShowSilenceForm(false);
      setSilenceName('');
      setSilenceValue('');
      setSilenceComment('');
      fetchData();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const deleteSilence = async (id: string) => {
    if (!amUrl) return;
    try {
      await prometheusClient.deleteAMSilence(amUrl, id, auth);
      fetchData();
    } catch (e: any) {
      setError(e.message);
    }
  };

  if (!connection || (connection.type !== 'prometheus' && connection.type !== 'victoriametrics')) {
    return <div className="flex items-center justify-center h-full text-gray-500"><p>Select a Prometheus connection.</p></div>;
  }

  if (!amUrl) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <p>No Alertmanager URL configured for this connection. Edit the connection to add one.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-white">Alertmanager</h1>
        <button onClick={fetchData} disabled={loading} className="p-2 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800 pb-1">
        {(['alerts', 'silences', 'status'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-t text-sm capitalize ${
              tab === t ? 'bg-gray-800 text-white border-b-2 border-blue-500' : 'text-gray-400 hover:text-white'
            }`}
          >
            {t}
            {t === 'alerts' && alerts.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-red-600 text-white text-[10px]">{alerts.length}</span>
            )}
          </button>
        ))}
      </div>

      {error && <div className="p-3 rounded bg-red-900/30 border border-red-800 text-red-300 text-sm">{error}</div>}

      {/* Alerts tab */}
      {tab === 'alerts' && (
        <div className="space-y-2">
          {alerts.length === 0 && !loading && (
            <div className="text-center py-8 text-gray-500 text-sm">No firing alerts</div>
          )}
          {alerts.map((a, i) => (
            <div key={i} className="rounded-lg border border-gray-800 p-4 space-y-2 hover:bg-gray-900/50">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  a.labels.severity === 'critical' ? 'bg-red-900/50 text-red-400' :
                  a.labels.severity === 'warning' ? 'bg-yellow-900/50 text-yellow-400' :
                  'bg-gray-800 text-gray-400'
                }`}>
                  {a.labels.severity || 'info'}
                </span>
                <span className="text-sm font-medium text-white">{a.labels.alertname}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  a.status.state === 'active' ? 'bg-red-900/30 text-red-400' :
                  a.status.state === 'suppressed' ? 'bg-yellow-900/30 text-yellow-400' :
                  'bg-gray-800 text-gray-400'
                }`}>
                  {a.status.state}
                </span>
              </div>
              <div className="text-xs text-gray-400 font-mono">
                {Object.entries(a.labels).filter(([k]) => k !== 'alertname' && k !== 'severity').map(([k, v]) => (
                  <span key={k} className="mr-2">{k}=&quot;{v}&quot;</span>
                ))}
              </div>
              {a.annotations?.description && (
                <p className="text-xs text-gray-500">{a.annotations.description}</p>
              )}
              <div className="text-xs text-gray-600">
                Started: {new Date(a.startsAt).toLocaleString()}
                {a.status.silencedBy.length > 0 && <span className="ml-2 text-yellow-500">Silenced</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Silences tab */}
      {tab === 'silences' && (
        <div className="space-y-3">
          <button
            onClick={() => setShowSilenceForm((s) => !s)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
          >
            <Plus size={12} />
            New Silence
          </button>

          {showSilenceForm && (
            <div className="rounded-lg border border-gray-800 p-4 space-y-3 bg-gray-900">
              <h3 className="text-sm font-medium text-white">Create Silence</h3>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Label name (e.g. alertname)"
                  value={silenceName}
                  onChange={(e) => setSilenceName(e.target.value)}
                  className="px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-200 text-xs placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
                <input
                  type="text"
                  placeholder="Value (e.g. HighCPU)"
                  value={silenceValue}
                  onChange={(e) => setSilenceValue(e.target.value)}
                  className="px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-200 text-xs placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex gap-3 items-center">
                <label className="flex items-center gap-1 text-xs text-gray-400">
                  <input type="checkbox" checked={silenceIsRegex} onChange={(e) => setSilenceIsRegex(e.target.checked)} />
                  Regex
                </label>
                <select
                  value={silenceDuration}
                  onChange={(e) => setSilenceDuration(e.target.value)}
                  className="px-2 py-1 rounded bg-gray-800 border border-gray-700 text-gray-300 text-xs"
                >
                  <option value="30m">30 minutes</option>
                  <option value="1h">1 hour</option>
                  <option value="2h">2 hours</option>
                  <option value="6h">6 hours</option>
                  <option value="24h">24 hours</option>
                  <option value="7d">7 days</option>
                </select>
              </div>
              <input
                type="text"
                placeholder="Comment"
                value={silenceComment}
                onChange={(e) => setSilenceComment(e.target.value)}
                className="w-full px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-200 text-xs placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
              <div className="flex gap-2">
                <button onClick={createSilence} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium">
                  Create
                </button>
                <button onClick={() => setShowSilenceForm(false)} className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {silences.length === 0 && !loading && (
            <div className="text-center py-8 text-gray-500 text-sm">No active silences</div>
          )}
          {silences.map((s) => (
            <div key={s.id} className="rounded-lg border border-gray-800 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    s.status.state === 'active' ? 'bg-yellow-900/30 text-yellow-400' : 'bg-gray-800 text-gray-400'
                  }`}>
                    {s.status.state}
                  </span>
                  <span className="text-xs text-gray-400">by {s.createdBy}</span>
                </div>
                <button
                  onClick={() => deleteSilence(s.id)}
                  className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                  title="Expire silence"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <div className="text-xs font-mono text-gray-300">
                {s.matchers.map((m, i) => (
                  <span key={i} className="mr-2">
                    {m.name}{m.isRegex ? '=~' : '='}&quot;{m.value}&quot;
                  </span>
                ))}
              </div>
              {s.comment && <p className="text-xs text-gray-500">{s.comment}</p>}
              <div className="text-xs text-gray-600">
                Until: {new Date(s.endsAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Status tab */}
      {tab === 'status' && status && (
        <div className="space-y-3">
          <div className="rounded-lg border border-gray-800 p-4">
            <h3 className="text-sm font-medium text-white mb-2">Cluster Status</h3>
            <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap">
              {JSON.stringify(status, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function parseDuration(s: string): number {
  const match = s.match(/^(\d+)(m|h|d)$/);
  if (!match) return 3600000;
  const val = parseInt(match[1]);
  switch (match[2]) {
    case 'm': return val * 60 * 1000;
    case 'h': return val * 3600 * 1000;
    case 'd': return val * 86400 * 1000;
    default: return 3600000;
  }
}
