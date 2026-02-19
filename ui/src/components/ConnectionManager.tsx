import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Check, X, Server, ChevronDown, ChevronUp, Pencil, Database, Flame, Hexagon, Globe, ChevronRight } from 'lucide-react';
import { client, type RemoteConnection } from '../api/client';
import { basePath } from '../config';

// ── Connection type ─────────────────────────────────────────────────────────

export type BackendType = 'influxdb' | 'prometheus' | 'victoriametrics';

export interface SavedConnection extends RemoteConnection {
  id: string;
  name: string;
  type: BackendType;
  source: 'browser' | 'cli';
  alertmanagerUrl?: string;
  alertmanagerUsername?: string;
  alertmanagerPassword?: string;
  proxyUrl?: string;
  // VM-specific fields
  clusterMode?: boolean;
  tenantId?: string;
  vminsertUrl?: string;
}

const STORAGE_KEY = 'timeseriesui_connections';
const ACTIVE_KEY = 'timeseriesui_active_connection';

function loadConnections(): SavedConnection[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('tidedb-connections');
    const conns = JSON.parse(data || '[]');
    return conns.map((c: any) => ({
      ...c,
      type: c.type || 'influxdb',
      source: c.source || 'browser',
    }));
  } catch {
    return [];
  }
}

function saveConnections(conns: SavedConnection[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conns));
}

function loadActiveId(): string | null {
  return localStorage.getItem(ACTIVE_KEY) || localStorage.getItem('tidedb-active-connection');
}

function saveActiveId(id: string | null) {
  if (id) localStorage.setItem(ACTIVE_KEY, id);
  else localStorage.removeItem(ACTIVE_KEY);
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── Component ───────────────────────────────────────────────────────────────

interface ConnectionManagerProps {
  onConnectionChange: (conn: SavedConnection | null) => void;
  defaultUrl?: string;
}

export default function ConnectionManager({ onConnectionChange, defaultUrl }: ConnectionManagerProps) {
  const [connections, setConnections] = useState<SavedConnection[]>(loadConnections);
  const [activeId, setActiveId] = useState<string | null>(loadActiveId);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form fields
  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formUser, setFormUser] = useState('');
  const [formPass, setFormPass] = useState('');
  const [formType, setFormType] = useState<BackendType>('influxdb');
  const [formAMUrl, setFormAMUrl] = useState('');
  const [formProxyUrl, setFormProxyUrl] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  // VM-specific
  const [formClusterMode, setFormClusterMode] = useState(false);
  const [formTenantId, setFormTenantId] = useState('');
  const [formVminsertUrl, setFormVminsertUrl] = useState('');

  // Merge CLI connections on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(basePath + '/api/v1/connections');
        if (res.ok) {
          const cliConns: any[] = await res.json();
          if (Array.isArray(cliConns) && cliConns.length > 0) {
            setConnections((prev) => {
              const existingUrls = new Set(prev.map((c) => c.url));
              const newConns = cliConns
                .filter((c) => !existingUrls.has(c.url))
                .map((c) => ({
                  id: generateId(),
                  name: c.name || 'CLI Connection',
                  type: (c.type || 'influxdb') as BackendType,
                  url: c.url,
                  username: c.username || '',
                  password: c.password || '',
                  source: 'cli' as const,
                  alertmanagerUrl: c.alertmanagerUrl,
                  alertmanagerUsername: c.alertmanagerUsername,
                  alertmanagerPassword: c.alertmanagerPassword,
                  proxyUrl: c.proxyUrl,
                  clusterMode: c.clusterMode,
                  tenantId: c.tenantId,
                  vminsertUrl: c.vminsertUrl,
                }));
              if (newConns.length === 0) return prev;
              const merged = [...prev, ...newConns];
              saveConnections(merged);
              return merged;
            });
          }
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    if (defaultUrl && connections.length === 0) {
      const conn: SavedConnection = {
        id: generateId(),
        name: 'Default',
        type: 'influxdb',
        url: defaultUrl,
        username: '',
        password: '',
        source: 'browser',
      };
      const updated = [conn];
      setConnections(updated);
      saveConnections(updated);
      setActiveId(conn.id);
      saveActiveId(conn.id);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const syncToClient = useCallback((conns: SavedConnection[], id: string | null) => {
    const active = conns.find((c) => c.id === id) || null;
    if (active && active.type === 'influxdb') {
      client.setRemoteConnection({ url: active.url, username: active.username, password: active.password });
    } else if (!active) {
      client.setRemoteConnection(null);
    }
    onConnectionChange(active);
  }, [onConnectionChange]);

  useEffect(() => {
    syncToClient(connections, activeId);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const activateConnection = (id: string) => {
    setActiveId(id);
    saveActiveId(id);
    syncToClient(connections, id);
  };

  const resetForm = () => {
    setFormName('');
    setFormUrl('');
    setFormUser('');
    setFormPass('');
    setFormType('influxdb');
    setFormAMUrl('');
    setFormProxyUrl('');
    setShowAdvanced(false);
    setFormClusterMode(false);
    setFormTenantId('');
    setFormVminsertUrl('');
    setEditingId(null);
  };

  const startAdd = () => {
    resetForm();
    setEditingId('new');
  };

  const startEdit = (conn: SavedConnection) => {
    setFormName(conn.name);
    setFormUrl(conn.url);
    setFormUser(conn.username);
    setFormPass(conn.password);
    setFormType(conn.type);
    setFormAMUrl(conn.alertmanagerUrl || '');
    setFormProxyUrl(conn.proxyUrl || '');
    setFormClusterMode(conn.clusterMode || false);
    setFormTenantId(conn.tenantId || '');
    setFormVminsertUrl(conn.vminsertUrl || '');
    setShowAdvanced(!!(conn.proxyUrl || conn.clusterMode));
    setEditingId(conn.id);
  };

  const saveForm = () => {
    const trimmedName = formName.trim() || 'Untitled';
    const trimmedUrl = formUrl.trim();
    if (!trimmedUrl) return;

    const hasAlertmanager = formType === 'prometheus' || formType === 'victoriametrics';

    const connData: Partial<SavedConnection> = {
      name: trimmedName,
      type: formType,
      url: trimmedUrl,
      username: formUser,
      password: formPass,
      alertmanagerUrl: hasAlertmanager ? formAMUrl.trim() || undefined : undefined,
      proxyUrl: formProxyUrl.trim() || undefined,
      clusterMode: formType === 'victoriametrics' ? formClusterMode : undefined,
      tenantId: formType === 'victoriametrics' && formClusterMode ? formTenantId.trim() || undefined : undefined,
      vminsertUrl: formType === 'victoriametrics' && formClusterMode ? formVminsertUrl.trim() || undefined : undefined,
    };

    if (editingId === 'new') {
      const conn: SavedConnection = {
        id: generateId(),
        source: 'browser',
        ...connData,
      } as SavedConnection;
      const updated = [...connections, conn];
      setConnections(updated);
      saveConnections(updated);
      if (updated.length === 1 || !activeId) {
        setActiveId(conn.id);
        saveActiveId(conn.id);
        syncToClient(updated, conn.id);
      }
    } else {
      const updated = connections.map((c) =>
        c.id === editingId ? { ...c, ...connData } : c,
      );
      setConnections(updated);
      saveConnections(updated);
      if (activeId === editingId) {
        syncToClient(updated, activeId);
      }
    }
    resetForm();
  };

  const removeConnection = (id: string) => {
    const conn = connections.find((c) => c.id === id);
    if (conn?.source === 'cli') return;
    const updated = connections.filter((c) => c.id !== id);
    setConnections(updated);
    saveConnections(updated);
    if (activeId === id) {
      const newActive = updated.length > 0 ? updated[0].id : null;
      setActiveId(newActive);
      saveActiveId(newActive);
      syncToClient(updated, newActive);
    }
    if (editingId === id) resetForm();
  };

  const activeConn = connections.find((c) => c.id === activeId);

  const TypeIcon = ({ type }: { type: BackendType }) => {
    if (type === 'victoriametrics') return <Hexagon size={10} className="text-emerald-400 flex-shrink-0" />;
    if (type === 'prometheus') return <Flame size={10} className="text-orange-400 flex-shrink-0" />;
    return <Database size={10} className="text-blue-400 flex-shrink-0" />;
  };

  const urlPlaceholder =
    formType === 'influxdb' ? 'URL (e.g. http://localhost:8086)' :
    formType === 'prometheus' ? 'URL (e.g. http://localhost:9090)' :
    'URL (e.g. http://localhost:8428)';

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between w-full px-3 py-2 text-xs font-medium text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors duration-150"
      >
        <span className="flex items-center gap-1.5 truncate">
          <Server size={12} className="flex-shrink-0" />
          {activeConn ? (
            <span className="flex items-center gap-1">
              <TypeIcon type={activeConn.type} />
              {activeConn.name}
            </span>
          ) : (
            'Connections'
          )}
        </span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <div className="mt-1 px-1 space-y-1">
          {connections.map((conn) => (
            <div
              key={conn.id}
              className={`flex items-center justify-between gap-1 px-2 py-1.5 rounded text-xs transition-colors duration-100 ${
                conn.id === activeId
                  ? 'bg-blue-600/20 border border-blue-600/40'
                  : 'bg-gray-800 border border-gray-700 hover:border-gray-600'
              }`}
            >
              <button
                onClick={() => activateConnection(conn.id)}
                className="flex-1 text-left truncate text-gray-200"
                title={`${conn.type}: ${conn.url}`}
              >
                <span className="font-medium flex items-center gap-1">
                  <TypeIcon type={conn.type} />
                  {conn.name}
                  {conn.source === 'cli' && (
                    <span className="text-[9px] bg-gray-700 text-gray-400 px-1 rounded">CLI</span>
                  )}
                </span>
                <span className="block text-gray-500 truncate text-[10px]">{conn.url}</span>
              </button>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                {conn.source !== 'cli' && (
                  <>
                    <button onClick={() => startEdit(conn)} className="p-1 text-gray-500 hover:text-gray-200 transition-colors" title="Edit">
                      <Pencil size={10} />
                    </button>
                    <button onClick={() => removeConnection(conn.id)} className="p-1 text-gray-500 hover:text-red-400 transition-colors" title="Remove">
                      <Trash2 size={10} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}

          {editingId ? (
            <div className="space-y-1.5 pt-1 border-t border-gray-700 mt-1">
              {/* Type selector */}
              <div className="flex gap-1">
                <button
                  onClick={() => setFormType('influxdb')}
                  className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-xs font-medium transition-colors ${
                    formType === 'influxdb'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-white border border-gray-700'
                  }`}
                >
                  <Database size={10} />
                  InfluxDB
                </button>
                <button
                  onClick={() => setFormType('prometheus')}
                  className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-xs font-medium transition-colors ${
                    formType === 'prometheus'
                      ? 'bg-orange-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-white border border-gray-700'
                  }`}
                >
                  <Flame size={10} />
                  Prometheus
                </button>
                <button
                  onClick={() => setFormType('victoriametrics')}
                  className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-xs font-medium transition-colors ${
                    formType === 'victoriametrics'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-white border border-gray-700'
                  }`}
                >
                  <Hexagon size={10} />
                  VM
                </button>
              </div>
              <input
                type="text"
                placeholder="Name (e.g. Production)"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                autoFocus
                className="w-full px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-200 text-xs placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
              <input
                type="text"
                placeholder={urlPlaceholder}
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                className="w-full px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-200 text-xs placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
              <input
                type="text"
                placeholder="Username (optional)"
                value={formUser}
                onChange={(e) => setFormUser(e.target.value)}
                className="w-full px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-200 text-xs placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
              <input
                type="password"
                placeholder="Password (optional)"
                value={formPass}
                onChange={(e) => setFormPass(e.target.value)}
                className="w-full px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-200 text-xs placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
              {(formType === 'prometheus' || formType === 'victoriametrics') && (
                <input
                  type="text"
                  placeholder="Alertmanager URL (optional)"
                  value={formAMUrl}
                  onChange={(e) => setFormAMUrl(e.target.value)}
                  className="w-full px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-200 text-xs placeholder-gray-500 focus:outline-none focus:border-orange-500 transition-colors"
                />
              )}

              {/* Advanced Options Toggle */}
              <button
                onClick={() => setShowAdvanced((s) => !s)}
                className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
              >
                <ChevronRight size={10} className={`transition-transform ${showAdvanced ? 'rotate-90' : ''}`} />
                Advanced Options
              </button>

              {showAdvanced && (
                <div className="space-y-1.5 pl-2 border-l-2 border-gray-800">
                  {/* Proxy URL */}
                  <div className="flex items-center gap-1.5">
                    <Globe size={10} className="text-gray-500 flex-shrink-0" />
                    <input
                      type="text"
                      placeholder="HTTP Proxy URL (e.g. http://proxy:8080)"
                      value={formProxyUrl}
                      onChange={(e) => setFormProxyUrl(e.target.value)}
                      className="w-full px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-200 text-xs placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
                    />
                  </div>
                  <p className="text-[10px] text-gray-600 pl-4">Route connections through a corporate or SOCKS proxy</p>

                  {/* VM Cluster Mode */}
                  {formType === 'victoriametrics' && (
                    <>
                      <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formClusterMode}
                          onChange={(e) => setFormClusterMode(e.target.checked)}
                          className="rounded bg-gray-800 border-gray-600 text-emerald-500 focus:ring-emerald-500"
                        />
                        Cluster Mode
                      </label>
                      {formClusterMode && (
                        <>
                          <input
                            type="text"
                            placeholder="Tenant ID (e.g. 0 or 0:0)"
                            value={formTenantId}
                            onChange={(e) => setFormTenantId(e.target.value)}
                            className="w-full px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-200 text-xs placeholder-gray-500 focus:outline-none focus:border-emerald-500 transition-colors"
                          />
                          <input
                            type="text"
                            placeholder="vminsert URL (e.g. http://vminsert:8480)"
                            value={formVminsertUrl}
                            onChange={(e) => setFormVminsertUrl(e.target.value)}
                            className="w-full px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-200 text-xs placeholder-gray-500 focus:outline-none focus:border-emerald-500 transition-colors"
                          />
                        </>
                      )}
                    </>
                  )}
                </div>
              )}

              <div className="flex gap-1.5">
                <button
                  onClick={saveForm}
                  disabled={!formUrl.trim()}
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors duration-150 disabled:opacity-40"
                >
                  <Check size={12} />
                  {editingId === 'new' ? 'Add' : 'Save'}
                </button>
                <button
                  onClick={resetForm}
                  className="flex items-center justify-center gap-1 px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs transition-colors duration-150"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={startAdd}
              className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs text-blue-400 hover:text-blue-300 hover:bg-gray-800 rounded transition-colors duration-150"
            >
              <Plus size={12} />
              Add Connection
            </button>
          )}
        </div>
      )}
    </div>
  );
}
