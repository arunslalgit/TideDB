import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Search, ChevronDown, ChevronRight } from 'lucide-react';
import { useActiveConnection } from '../../hooks/useActiveConnection';
import prometheusClient from '../../api/prometheus';
import type { RuleGroup, Rule } from '../../api/prometheus';

const STATE_COLORS: Record<string, string> = {
  firing: 'bg-red-500',
  pending: 'bg-yellow-500',
  inactive: 'bg-gray-600',
};

const STATE_TEXT: Record<string, string> = {
  firing: 'text-red-400',
  pending: 'text-yellow-400',
  inactive: 'text-gray-500',
};

export default function PromAlertRules() {
  const { connection, auth } = useActiveConnection();
  const [groups, setGroups] = useState<RuleGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState<'all' | 'firing' | 'pending' | 'inactive'>('all');
  const [showRecording, setShowRecording] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const fetchRules = useCallback(async () => {
    if (!connection || connection.type !== 'prometheus') return;
    setLoading(true);
    setError(null);
    try {
      const resp = await prometheusClient.getRules(connection.url, undefined, auth);
      if (resp.status !== 'success') throw new Error('Failed to fetch rules');
      setGroups(resp.data.groups || []);
      setExpandedGroups(new Set((resp.data.groups || []).map((g) => g.name)));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [connection, auth]);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const toggleGroup = (name: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  // Flatten for counting
  const allRules = groups.flatMap((g) => g.rules);
  const alertRules = allRules.filter((r) => r.type === 'alerting');
  const firingCount = alertRules.filter((r) => r.state === 'firing').length;
  const pendingCount = alertRules.filter((r) => r.state === 'pending').length;
  const inactiveCount = alertRules.filter((r) => r.state === 'inactive').length;

  const filterRule = (r: Rule): boolean => {
    if (!showRecording && r.type === 'recording') return false;
    if (r.type === 'alerting' && stateFilter !== 'all' && r.state !== stateFilter) return false;
    if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  };

  if (!connection || connection.type !== 'prometheus') {
    return <div className="flex items-center justify-center h-full text-gray-500"><p>Select a Prometheus connection.</p></div>;
  }

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-white">Alert Rules</h1>
        <button onClick={fetchRules} disabled={loading} className="p-2 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Summary */}
      <div className="flex gap-4 text-sm">
        <span className="text-gray-400">{alertRules.length} rules</span>
        {firingCount > 0 && <span className="text-red-400">{firingCount} firing</span>}
        {pendingCount > 0 && <span className="text-yellow-400">{pendingCount} pending</span>}
        <span className="text-gray-500">{inactiveCount} inactive</span>
      </div>

      {/* Filters */}
      <div className="flex gap-2 items-center flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-2 text-gray-500" />
          <input
            type="text"
            placeholder="Search rules..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-200 text-xs placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="flex gap-1">
          {(['all', 'firing', 'pending', 'inactive'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStateFilter(s)}
              className={`px-3 py-1 rounded text-xs capitalize ${
                stateFilter === s ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-400">
          <input
            type="checkbox"
            checked={showRecording}
            onChange={(e) => setShowRecording(e.target.checked)}
            className="rounded border-gray-600"
          />
          Recording Rules
        </label>
      </div>

      {error && <div className="p-3 rounded bg-red-900/30 border border-red-800 text-red-300 text-sm">{error}</div>}

      {/* Rule groups */}
      <div className="space-y-3">
        {groups.map((g) => {
          const filtered = g.rules.filter(filterRule);
          if (filtered.length === 0) return null;
          return (
            <div key={g.name} className="rounded-lg border border-gray-800 overflow-hidden">
              <button
                onClick={() => toggleGroup(g.name)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-900 hover:bg-gray-800/70 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  {expandedGroups.has(g.name) ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-500" />}
                  <span className="text-sm font-medium text-white">{g.name}</span>
                  <span className="text-xs text-gray-500">{g.file}</span>
                </div>
                <span className="text-xs text-gray-500">{filtered.length} rules</span>
              </button>
              {expandedGroups.has(g.name) && (
                <div className="divide-y divide-gray-800/50">
                  {filtered.map((r, i) => (
                    <div key={i} className="px-4 py-3 space-y-1.5 hover:bg-gray-900/50">
                      <div className="flex items-center gap-2">
                        {r.state && (
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATE_COLORS[r.state] || 'bg-gray-600'}`} />
                        )}
                        <span className={`text-xs font-semibold uppercase ${STATE_TEXT[r.state || ''] || 'text-gray-500'}`}>
                          {r.state || r.type}
                        </span>
                        <span className="text-sm font-medium text-white">{r.name}</span>
                        {r.duration !== undefined && r.duration > 0 && (
                          <span className="text-xs text-gray-500">for {r.duration}s</span>
                        )}
                        {r.labels?.severity && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            r.labels.severity === 'critical' ? 'bg-red-900/50 text-red-400' :
                            r.labels.severity === 'warning' ? 'bg-yellow-900/50 text-yellow-400' :
                            'bg-gray-800 text-gray-400'
                          }`}>
                            {r.labels.severity}
                          </span>
                        )}
                      </div>
                      <pre className="text-xs text-gray-400 font-mono bg-gray-900/50 rounded px-2 py-1 overflow-x-auto">
                        {r.query}
                      </pre>
                      {r.annotations?.summary && (
                        <p className="text-xs text-gray-500">{r.annotations.summary}</p>
                      )}
                      {r.alerts && r.alerts.length > 0 && (
                        <div className="pl-4 mt-1 space-y-1">
                          <span className="text-xs text-gray-500">Firing instances ({r.alerts.length}):</span>
                          {r.alerts.slice(0, 5).map((a, ai) => (
                            <div key={ai} className="text-xs text-gray-400 font-mono pl-2 border-l border-gray-700">
                              {Object.entries(a.labels).filter(([k]) => k !== 'alertname').map(([k, v]) => `${k}="${v}"`).join(', ')}
                              {' '}= {a.value}
                              <span className="text-gray-600 ml-2">since {new Date(a.activeAt).toLocaleString()}</span>
                            </div>
                          ))}
                          {r.alerts.length > 5 && (
                            <p className="text-xs text-gray-600 pl-2">...and {r.alerts.length - 5} more</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
