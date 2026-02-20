import { useState, useEffect, useCallback } from 'react';
import { Database, Plus, Trash2, Users, RefreshCw, Shield, BarChart3, AlertTriangle, Pencil, Key, Link, Eye, ChevronDown, ChevronUp } from 'lucide-react';
import { client } from '../../api/client';

// ── Types ──────────────────────────────────────────────────────────────────────

interface RetentionPolicy {
  name: string;
  duration: string;
  shardGroupDuration: string;
  replicaN: number;
  default: boolean;
}

interface DatabaseInfo {
  name: string;
  expanded: boolean;
  retentionPolicies: RetentionPolicy[] | null;
  seriesCardinality: number | null;
  loadingRPs: boolean;
  loadingCardinality: boolean;
}

interface ContinuousQuery {
  name: string;
  query: string;
}

interface ContinuousQueryGroup {
  database: string;
  queries: ContinuousQuery[];
}

interface UserInfo {
  user: string;
  admin: boolean;
}

type ActiveTab = 'databases' | 'continuous_queries' | 'users' | 'insights' | 'subscriptions' | 'privileges';

// ── Confirmation Modal ─────────────────────────────────────────────────────────

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
  /** When set, the user must type this exact text to enable the confirm button. */
  requireTypedConfirmation?: string;
}

function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
  danger = true,
  requireTypedConfirmation,
}: ConfirmModalProps) {
  const [typed, setTyped] = useState('');
  const confirmEnabled = !requireTypedConfirmation || typed === requireTypedConfirmation;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-gray-800 rounded-lg shadow-2xl border border-gray-700 w-full max-w-md mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-100 mb-2">{title}</h3>
        <p className="text-sm text-gray-400 mb-4">{message}</p>
        {requireTypedConfirmation && (
          <div className="mb-4">
            <p className="text-xs text-gray-500 mb-2">
              Type <span className="font-mono text-red-400 font-semibold">{requireTypedConfirmation}</span> to confirm:
            </p>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
              placeholder={requireTypedConfirmation}
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-red-500 transition-colors duration-150 font-mono"
            />
          </div>
        )}
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-md transition-colors duration-150"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!confirmEnabled}
            className={`px-4 py-2 text-sm font-semibold text-white rounded-md transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${
              danger
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Error Banner ───────────────────────────────────────────────────────────────

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

// ── Success Banner ─────────────────────────────────────────────────────────────

interface SuccessBannerProps {
  message: string;
  onDismiss: () => void;
}

function SuccessBanner({ message, onDismiss }: SuccessBannerProps) {
  return (
    <div className="flex items-start justify-between bg-green-950/60 border border-green-700 rounded-md px-4 py-3 mb-4 text-sm text-green-300">
      <span>{message}</span>
      <button
        onClick={onDismiss}
        className="ml-4 flex-shrink-0 text-green-400 hover:text-green-200 transition-colors duration-150"
      >
        &times;
      </button>
    </div>
  );
}

// ── Create Database Modal ──────────────────────────────────────────────────────

interface CreateDatabaseModalProps {
  onClose: () => void;
  onCreated: () => void;
}

function CreateDatabaseModal({ onClose, onCreated }: CreateDatabaseModalProps) {
  const [dbName, setDbName] = useState('');
  const [duration, setDuration] = useState('30d');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    const trimmed = dbName.trim();
    if (!trimmed) {
      setError('Database name is required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const dur = duration.trim() || 'INF';
      await client.query(`CREATE DATABASE "${trimmed}" WITH DURATION ${dur}`);
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create database.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-gray-800 rounded-lg shadow-2xl border border-gray-700 w-full max-w-md mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-100 mb-4 flex items-center gap-2">
          <Database className="w-5 h-5 text-blue-400" />
          Create Database
        </h3>
        {error && (
          <div className="bg-red-950/60 border border-red-700 rounded-md px-3 py-2 mb-4 text-sm text-red-300 font-mono">
            {error}
          </div>
        )}
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Database Name</label>
            <input
              type="text"
              value={dbName}
              onChange={(e) => setDbName(e.target.value)}
              placeholder="my_database"
              autoFocus
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors duration-150"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Default RP Duration
              <span className="ml-2 text-xs text-gray-500">(e.g. 30d, 1h, INF)</span>
            </label>
            <input
              type="text"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="30d"
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors duration-150"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-md transition-colors duration-150 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={loading}
            className="px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors duration-150 disabled:opacity-50 flex items-center gap-2"
          >
            {loading && (
              <svg className="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
            Create Database
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Create Retention Policy Modal ─────────────────────────────────────────────

interface CreateRPModalProps {
  database: string;
  onClose: () => void;
  onCreated: () => void;
}

function CreateRPModal({ database, onClose, onCreated }: CreateRPModalProps) {
  const [rpName, setRpName] = useState('');
  const [duration, setDuration] = useState('30d');
  const [shardDuration, setShardDuration] = useState('');
  const [replication, setReplication] = useState('1');
  const [makeDefault, setMakeDefault] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    const trimmedName = rpName.trim();
    if (!trimmedName) {
      setError('Retention policy name is required.');
      return;
    }
    const trimmedDuration = duration.trim();
    if (!trimmedDuration) {
      setError('Duration is required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      let q = `CREATE RETENTION POLICY "${trimmedName}" ON "${database}" DURATION ${trimmedDuration} REPLICATION ${replication || '1'}`;
      if (shardDuration.trim()) {
        q += ` SHARD DURATION ${shardDuration.trim()}`;
      }
      if (makeDefault) {
        q += ' DEFAULT';
      }
      await client.query(q);
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create retention policy.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-gray-800 rounded-lg shadow-2xl border border-gray-700 w-full max-w-md mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-100 mb-1 flex items-center gap-2">
          <Plus className="w-5 h-5 text-blue-400" />
          Create Retention Policy
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          on database <span className="text-blue-400 font-mono">{database}</span>
        </p>
        {error && (
          <div className="bg-red-950/60 border border-red-700 rounded-md px-3 py-2 mb-4 text-sm text-red-300 font-mono">
            {error}
          </div>
        )}
        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Policy Name</label>
            <input
              type="text"
              value={rpName}
              onChange={(e) => setRpName(e.target.value)}
              placeholder="my_policy"
              autoFocus
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors duration-150"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Duration
              <span className="ml-2 text-xs text-gray-500">(e.g. 7d, 30d, INF)</span>
            </label>
            <input
              type="text"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="30d"
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors duration-150"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Shard Group Duration
              <span className="ml-2 text-xs text-gray-500">(optional, e.g. 1d)</span>
            </label>
            <input
              type="text"
              value={shardDuration}
              onChange={(e) => setShardDuration(e.target.value)}
              placeholder="auto"
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors duration-150"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Replication Factor</label>
            <input
              type="number"
              min="1"
              value={replication}
              onChange={(e) => setReplication(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors duration-150"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={makeDefault}
              onChange={(e) => setMakeDefault(e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800"
            />
            <span className="text-sm text-gray-300">Set as default retention policy</span>
          </label>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-md transition-colors duration-150 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={loading}
            className="px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors duration-150 disabled:opacity-50 flex items-center gap-2"
          >
            {loading && (
              <svg className="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
            Create Policy
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Alter Retention Policy Modal ──────────────────────────────────────────────

interface AlterRPModalProps {
  database: string;
  rp: RetentionPolicy;
  onClose: () => void;
  onAltered: () => void;
}

function AlterRPModal({ database, rp, onClose, onAltered }: AlterRPModalProps) {
  const [duration, setDuration] = useState(rp.duration || '');
  const [shardDuration, setShardDuration] = useState(rp.shardGroupDuration || '');
  const [replication, setReplication] = useState(String(rp.replicaN ?? 1));
  const [makeDefault, setMakeDefault] = useState(rp.default);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAlter = async () => {
    setLoading(true);
    setError('');
    try {
      let q = `ALTER RETENTION POLICY "${rp.name}" ON "${database}"`;
      if (duration.trim()) q += ` DURATION ${duration.trim()}`;
      q += ` REPLICATION ${replication || '1'}`;
      if (shardDuration.trim()) q += ` SHARD DURATION ${shardDuration.trim()}`;
      if (makeDefault) q += ' DEFAULT';
      await client.query(q);
      onAltered();
      onClose();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to alter retention policy.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-gray-800 rounded-lg shadow-2xl border border-gray-700 w-full max-w-md mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-100 mb-1 flex items-center gap-2">
          <Pencil className="w-5 h-5 text-blue-400" />
          Alter Retention Policy
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          <span className="text-blue-400 font-mono">{rp.name}</span> on <span className="text-blue-400 font-mono">{database}</span>
        </p>
        {error && (
          <div className="bg-red-950/60 border border-red-700 rounded-md px-3 py-2 mb-4 text-sm text-red-300 font-mono">
            {error}
          </div>
        )}
        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Duration <span className="text-xs text-gray-500">(e.g. 7d, 30d, INF)</span></label>
            <input type="text" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="30d"
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors duration-150" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Shard Group Duration <span className="text-xs text-gray-500">(optional)</span></label>
            <input type="text" value={shardDuration} onChange={(e) => setShardDuration(e.target.value)} placeholder="auto"
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors duration-150" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Replication Factor</label>
            <input type="number" min="1" value={replication} onChange={(e) => setReplication(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors duration-150" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800" />
            <span className="text-sm text-gray-300">Set as default retention policy</span>
          </label>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} disabled={loading}
            className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-md transition-colors duration-150 disabled:opacity-50">Cancel</button>
          <button onClick={handleAlter} disabled={loading}
            className="px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors duration-150 disabled:opacity-50 flex items-center gap-2">
            {loading && (
              <svg className="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
            Alter Policy
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tab 1: Databases & Retention Policies ─────────────────────────────────────

interface DatabasesTabProps {
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

function DatabasesTab({ onError, onSuccess }: DatabasesTabProps) {
  const [databases, setDatabases] = useState<DatabaseInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDb, setShowCreateDb] = useState(false);
  const [confirmDrop, setConfirmDrop] = useState<string | null>(null);
  const [createRPFor, setCreateRPFor] = useState<string | null>(null);
  const [alterRP, setAlterRP] = useState<{ db: string; rp: RetentionPolicy } | null>(null);
  const [confirmDropRP, setConfirmDropRP] = useState<{ db: string; rpName: string } | null>(null);

  const fetchDatabases = useCallback(async () => {
    setLoading(true);
    try {
      const names = await client.getDatabases();
      setDatabases((prev) => {
        const prevMap = new Map(prev.map((d) => [d.name, d]));
        return names.map((name) => {
          const existing = prevMap.get(name);
          return existing ?? {
            name,
            expanded: false,
            retentionPolicies: null,
            seriesCardinality: null,
            loadingRPs: false,
            loadingCardinality: false,
          };
        });
      });
    } catch (err: any) {
      onError(err?.message ?? 'Failed to load databases.');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    fetchDatabases();
  }, [fetchDatabases]);

  const toggleExpand = useCallback(async (dbName: string) => {
    setDatabases((prev) =>
      prev.map((db) => {
        if (db.name !== dbName) return db;
        return { ...db, expanded: !db.expanded };
      }),
    );

    // Load RPs and cardinality if not yet loaded
    const db = databases.find((d) => d.name === dbName);
    if (!db || db.retentionPolicies !== null) return;

    setDatabases((prev) =>
      prev.map((d) =>
        d.name === dbName ? { ...d, loadingRPs: true, loadingCardinality: true } : d,
      ),
    );

    try {
      const [rps, cardinality] = await Promise.all([
        client.getRetentionPolicies(dbName),
        client.getSeriesCardinality(dbName),
      ]);

      const parsedRPs: RetentionPolicy[] = rps.map((rp: any) => ({
        name: rp.name,
        duration: rp.duration,
        shardGroupDuration: rp.shardGroupDuration,
        replicaN: rp.replicaN,
        default: rp.default,
      }));

      setDatabases((prev) =>
        prev.map((d) =>
          d.name === dbName
            ? {
                ...d,
                retentionPolicies: parsedRPs,
                seriesCardinality: cardinality,
                loadingRPs: false,
                loadingCardinality: false,
              }
            : d,
        ),
      );
    } catch (err: any) {
      setDatabases((prev) =>
        prev.map((d) =>
          d.name === dbName ? { ...d, loadingRPs: false, loadingCardinality: false } : d,
        ),
      );
      onError(err?.message ?? `Failed to load details for ${dbName}.`);
    }
  }, [databases, onError]);

  const handleDropDatabase = async (dbName: string) => {
    setConfirmDrop(null);
    try {
      await client.query(`DROP DATABASE "${dbName}"`);
      onSuccess(`Database "${dbName}" dropped successfully.`);
      fetchDatabases();
    } catch (err: any) {
      onError(err?.message ?? `Failed to drop database "${dbName}".`);
    }
  };

  const refreshDbRPs = (dbName: string) => {
    setDatabases((prev) =>
      prev.map((d) =>
        d.name === dbName ? { ...d, retentionPolicies: null, seriesCardinality: null } : d,
      ),
    );
  };

  const handleRPCreated = (dbName: string) => {
    refreshDbRPs(dbName);
    onSuccess(`Retention policy created on "${dbName}".`);
  };

  const handleDropRP = async (dbName: string, rpName: string) => {
    setConfirmDropRP(null);
    try {
      await client.query(`DROP RETENTION POLICY "${rpName}" ON "${dbName}"`);
      refreshDbRPs(dbName);
      onSuccess(`Retention policy "${rpName}" dropped from "${dbName}".`);
      // Force re-expand to reload
      setDatabases((prev) => prev.map((d) => d.name === dbName ? { ...d, expanded: false } : d));
      setTimeout(() => toggleExpand(dbName), 100);
    } catch (err: any) {
      onError(err?.message ?? `Failed to drop retention policy "${rpName}".`);
    }
  };

  const handleRPAltered = (dbName: string) => {
    refreshDbRPs(dbName);
    onSuccess(`Retention policy altered on "${dbName}".`);
    setDatabases((prev) => prev.map((d) => d.name === dbName ? { ...d, expanded: false } : d));
    setTimeout(() => toggleExpand(dbName), 100);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-200 flex items-center gap-2">
          <Database className="w-5 h-5 text-blue-400" />
          Databases
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchDatabases}
            disabled={loading}
            title="Refresh"
            className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 rounded-md border border-gray-700 transition-colors duration-150 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowCreateDb(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors duration-150"
          >
            <Plus className="w-4 h-4" />
            Create Database
          </button>
        </div>
      </div>

      {loading && databases.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-gray-500">
          <svg className="w-5 h-5 animate-spin mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Loading databases...
        </div>
      ) : databases.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Database className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No databases found.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {databases.map((db) => (
            <div key={db.name} className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
              {/* Database header row */}
              <div className="flex items-center justify-between px-4 py-3">
                <button
                  onClick={() => toggleExpand(db.name)}
                  className="flex items-center gap-2 text-left group"
                >
                  <span
                    className={`text-gray-400 transition-transform duration-150 ${db.expanded ? 'rotate-90' : 'rotate-0'}`}
                  >
                    &#9654;
                  </span>
                  <Database className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  <span className="text-sm font-medium text-gray-100 group-hover:text-white transition-colors duration-150 font-mono">
                    {db.name}
                  </span>
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCreateRPFor(db.name)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-md border border-gray-600 transition-colors duration-150"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Create RP
                  </button>
                  <button
                    onClick={() => setConfirmDrop(db.name)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors duration-150"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Drop
                  </button>
                </div>
              </div>

              {/* Expanded section */}
              {db.expanded && (
                <div className="border-t border-gray-700 px-4 py-3">
                  {db.loadingRPs ? (
                    <div className="flex items-center gap-2 text-gray-500 text-sm py-2">
                      <svg className="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Loading details...
                    </div>
                  ) : (
                    <>
                      {/* Series cardinality */}
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs text-gray-500">Series Cardinality:</span>
                        <span className="text-xs font-mono text-blue-300">
                          {db.seriesCardinality !== null
                            ? db.seriesCardinality.toLocaleString()
                            : 'N/A'}
                        </span>
                      </div>

                      {/* Retention policies table */}
                      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                        Retention Policies
                      </div>
                      {db.retentionPolicies && db.retentionPolicies.length > 0 ? (
                        <div className="rounded border border-gray-700 overflow-hidden">
                          <table className="min-w-full text-xs">
                            <thead>
                              <tr className="bg-gray-800 border-b border-gray-700">
                                <th className="px-3 py-2 text-left font-semibold text-gray-400 whitespace-nowrap">Name</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-400 whitespace-nowrap">Duration</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-400 whitespace-nowrap">Shard Group Duration</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-400 whitespace-nowrap">Replication</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-400 whitespace-nowrap">Default</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-400 whitespace-nowrap">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {db.retentionPolicies.map((rp) => (
                                <tr key={rp.name} className="border-b border-gray-700 last:border-0 hover:bg-gray-700/30 transition-colors duration-150">
                                  <td className="px-3 py-2 font-mono text-gray-200">{rp.name}</td>
                                  <td className="px-3 py-2 text-gray-300">{rp.duration || 'INF'}</td>
                                  <td className="px-3 py-2 text-gray-300">{rp.shardGroupDuration || 'auto'}</td>
                                  <td className="px-3 py-2 text-gray-300">{rp.replicaN}</td>
                                  <td className="px-3 py-2">
                                    {rp.default ? (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-blue-900/60 text-blue-300 border border-blue-700">
                                        default
                                      </span>
                                    ) : (
                                      <span className="text-gray-600">&mdash;</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    <div className="flex items-center gap-1 justify-end">
                                      <button onClick={() => setAlterRP({ db: db.name, rp })} title="Edit"
                                        className="p-1.5 text-gray-400 hover:text-blue-300 hover:bg-gray-700 rounded transition-colors duration-150">
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>
                                      <button onClick={() => setConfirmDropRP({ db: db.name, rpName: rp.name })} title="Drop"
                                        className="p-1.5 text-gray-400 hover:text-red-300 hover:bg-gray-700 rounded transition-colors duration-150">
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">No retention policies found.</p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {showCreateDb && (
        <CreateDatabaseModal
          onClose={() => setShowCreateDb(false)}
          onCreated={() => {
            onSuccess('Database created successfully.');
            fetchDatabases();
          }}
        />
      )}

      {confirmDrop && (
        <ConfirmModal
          title="Drop Database"
          message={`Are you sure you want to drop the database "${confirmDrop}"? This action is irreversible and all data will be permanently deleted.`}
          confirmLabel="Drop Database"
          requireTypedConfirmation={confirmDrop}
          onConfirm={() => handleDropDatabase(confirmDrop)}
          onCancel={() => setConfirmDrop(null)}
        />
      )}

      {createRPFor && (
        <CreateRPModal
          database={createRPFor}
          onClose={() => setCreateRPFor(null)}
          onCreated={() => handleRPCreated(createRPFor)}
        />
      )}

      {alterRP && (
        <AlterRPModal
          database={alterRP.db}
          rp={alterRP.rp}
          onClose={() => setAlterRP(null)}
          onAltered={() => handleRPAltered(alterRP.db)}
        />
      )}

      {confirmDropRP && (
        <ConfirmModal
          title="Drop Retention Policy"
          message={`Are you sure you want to drop the retention policy "${confirmDropRP.rpName}" on database "${confirmDropRP.db}"? All data in this policy will be permanently deleted.`}
          confirmLabel="Drop RP"
          requireTypedConfirmation={confirmDropRP.rpName}
          onConfirm={() => handleDropRP(confirmDropRP.db, confirmDropRP.rpName)}
          onCancel={() => setConfirmDropRP(null)}
        />
      )}
    </div>
  );
}

// ── Create Continuous Query Modal ─────────────────────────────────────────────

interface CreateCQModalProps {
  databases: string[];
  onClose: () => void;
  onCreated: () => void;
}

function CreateCQModal({ databases, onClose, onCreated }: CreateCQModalProps) {
  const [cqName, setCqName] = useState('');
  const [database, setDatabase] = useState(databases[0] ?? '');
  const [resampleEvery, setResampleEvery] = useState('');
  const [resampleFor, setResampleFor] = useState('');
  const [selectQuery, setSelectQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    const trimmedName = cqName.trim();
    if (!trimmedName) {
      setError('Continuous query name is required.');
      return;
    }
    if (!database) {
      setError('Database is required.');
      return;
    }
    const trimmedQuery = selectQuery.trim();
    if (!trimmedQuery) {
      setError('SELECT query is required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      let resampleClause = '';
      const every = resampleEvery.trim();
      const forDur = resampleFor.trim();
      if (every || forDur) {
        resampleClause = ' RESAMPLE';
        if (every) resampleClause += ` EVERY ${every}`;
        if (forDur) resampleClause += ` FOR ${forDur}`;
      }
      const q = `CREATE CONTINUOUS QUERY "${trimmedName}" ON "${database}"${resampleClause} BEGIN ${trimmedQuery} END`;
      await client.query(q);
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create continuous query.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-gray-800 rounded-lg shadow-2xl border border-gray-700 w-full max-w-lg mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-100 mb-4 flex items-center gap-2">
          <RefreshCw className="w-5 h-5 text-blue-400" />
          Create Continuous Query
        </h3>
        {error && (
          <div className="bg-red-950/60 border border-red-700 rounded-md px-3 py-2 mb-4 text-sm text-red-300 font-mono break-all">
            {error}
          </div>
        )}
        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-sm text-gray-400 mb-1">CQ Name</label>
            <input
              type="text"
              value={cqName}
              onChange={(e) => setCqName(e.target.value)}
              placeholder="my_cq"
              autoFocus
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors duration-150"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Database</label>
            <select
              value={database}
              onChange={(e) => setDatabase(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 transition-colors duration-150"
            >
              {databases.map((db) => (
                <option key={db} value={db}>{db}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Resample Every
                <span className="ml-1 text-xs text-gray-500">(optional)</span>
              </label>
              <input
                type="text"
                value={resampleEvery}
                onChange={(e) => setResampleEvery(e.target.value)}
                placeholder="e.g. 1h"
                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors duration-150"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Resample For
                <span className="ml-1 text-xs text-gray-500">(optional)</span>
              </label>
              <input
                type="text"
                value={resampleFor}
                onChange={(e) => setResampleFor(e.target.value)}
                placeholder="e.g. 2h"
                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors duration-150"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              SELECT Query
              <span className="ml-2 text-xs text-gray-500">(the full SELECT ... INTO ... FROM ... GROUP BY time(...) statement)</span>
            </label>
            <textarea
              value={selectQuery}
              onChange={(e) => setSelectQuery(e.target.value)}
              placeholder={'SELECT mean("value") INTO "downsampled"."autogen"."cpu" FROM "cpu" GROUP BY time(1h)'}
              rows={4}
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors duration-150 font-mono resize-y"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-md transition-colors duration-150 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={loading}
            className="px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors duration-150 disabled:opacity-50 flex items-center gap-2"
          >
            {loading && (
              <svg className="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
            Create CQ
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tab 2: Continuous Queries ─────────────────────────────────────────────────

interface ContinuousQueriesTabProps {
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

function ContinuousQueriesTab({ onError, onSuccess }: ContinuousQueriesTabProps) {
  const [groups, setGroups] = useState<ContinuousQueryGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateCQ, setShowCreateCQ] = useState(false);
  const [databases, setDatabases] = useState<string[]>([]);
  const [confirmDrop, setConfirmDrop] = useState<{ name: string; db: string } | null>(null);

  const fetchDatabases = useCallback(async () => {
    try {
      const dbs = await client.getDatabases();
      setDatabases(dbs);
    } catch {
      // ignore — databases are only needed for the create modal
    }
  }, []);

  const fetchCQs = useCallback(async () => {
    setLoading(true);
    try {
      const rawSeries = await client.getContinuousQueries();
      const parsed: ContinuousQueryGroup[] = rawSeries.map((series: any) => {
        const nameIdx = series.columns?.indexOf('name') ?? 0;
        const queryIdx = series.columns?.indexOf('query') ?? 1;
        const queries: ContinuousQuery[] = (series.values ?? []).map((v: any[]) => ({
          name: v[nameIdx],
          query: v[queryIdx],
        }));
        return {
          database: series.name,
          queries,
        };
      });
      setGroups(parsed);
    } catch (err: any) {
      onError(err?.message ?? 'Failed to load continuous queries.');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    fetchCQs();
    fetchDatabases();
  }, [fetchCQs, fetchDatabases]);

  const handleDropCQ = async (cqName: string, dbName: string) => {
    setConfirmDrop(null);
    try {
      await client.query(`DROP CONTINUOUS QUERY "${cqName}" ON "${dbName}"`);
      onSuccess(`Continuous query "${cqName}" dropped from "${dbName}".`);
      fetchCQs();
    } catch (err: any) {
      onError(err?.message ?? `Failed to drop continuous query "${cqName}".`);
    }
  };

  const totalCQs = groups.reduce((acc, g) => acc + g.queries.length, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-200 flex items-center gap-2">
          <RefreshCw className="w-5 h-5 text-blue-400" />
          Continuous Queries
          {!loading && (
            <span className="ml-1 text-xs font-normal text-gray-500">
              ({totalCQs} total)
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchCQs}
            disabled={loading}
            title="Refresh"
            className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 rounded-md border border-gray-700 transition-colors duration-150 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => { fetchDatabases(); setShowCreateCQ(true); }}
            className="flex items-center gap-2 px-3 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors duration-150"
          >
            <Plus className="w-4 h-4" />
            Create CQ
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-500">
          <svg className="w-5 h-5 animate-spin mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Loading continuous queries...
        </div>
      ) : groups.length === 0 || totalCQs === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <RefreshCw className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No continuous queries found.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.filter((g) => g.queries.length > 0).map((group) => (
            <div key={group.database} className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-700 bg-gray-800">
                <Database className="w-4 h-4 text-blue-400 flex-shrink-0" />
                <span className="text-sm font-semibold text-gray-200 font-mono">{group.database}</span>
                <span className="text-xs text-gray-500 ml-1">
                  ({group.queries.length} {group.queries.length === 1 ? 'query' : 'queries'})
                </span>
              </div>
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-gray-800 border-b border-gray-700">
                    <th className="px-4 py-2 text-left font-semibold text-gray-400 w-40">Name</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-400">Query</th>
                    <th className="px-4 py-2 text-right font-semibold text-gray-400 w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {group.queries.map((cq) => (
                    <tr key={cq.name} className="border-b border-gray-700 last:border-0 hover:bg-gray-700/30 transition-colors duration-150">
                      <td className="px-4 py-2.5 font-mono text-blue-300 align-top whitespace-nowrap">{cq.name}</td>
                      <td className="px-4 py-2.5 text-gray-300 font-mono break-all align-top">
                        <span className="whitespace-pre-wrap text-xs leading-relaxed">{cq.query}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right align-top">
                        <button
                          onClick={() => setConfirmDrop({ name: cq.name, db: group.database })}
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors duration-150 ml-auto"
                        >
                          <Trash2 className="w-3 h-3" />
                          Drop
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {confirmDrop && (
        <ConfirmModal
          title="Drop Continuous Query"
          message={`Are you sure you want to drop the continuous query "${confirmDrop.name}" on database "${confirmDrop.db}"?`}
          confirmLabel="Drop CQ"
          onConfirm={() => handleDropCQ(confirmDrop.name, confirmDrop.db)}
          onCancel={() => setConfirmDrop(null)}
        />
      )}

      {showCreateCQ && (
        <CreateCQModal
          databases={databases}
          onClose={() => setShowCreateCQ(false)}
          onCreated={() => {
            onSuccess('Continuous query created successfully.');
            fetchCQs();
          }}
        />
      )}
    </div>
  );
}

// ── Create User Form ───────────────────────────────────────────────────────────

interface CreateUserFormProps {
  onCreated: () => void;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

function CreateUserForm({ onCreated, onError, onSuccess }: CreateUserFormProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    const trimmedUser = username.trim();
    if (!trimmedUser) {
      onError('Username is required.');
      return;
    }
    if (!password) {
      onError('Password is required.');
      return;
    }
    setLoading(true);
    try {
      await client.query(`CREATE USER "${trimmedUser}" WITH PASSWORD '${password}'`);
      if (isAdmin) {
        await client.query(`GRANT ALL PRIVILEGES TO "${trimmedUser}"`);
      }
      onSuccess(`User "${trimmedUser}" created successfully.`);
      setUsername('');
      setPassword('');
      setIsAdmin(false);
      onCreated();
    } catch (err: any) {
      onError(err?.message ?? 'Failed to create user.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 mb-6">
      <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
        <Plus className="w-4 h-4 text-blue-400" />
        Create User
      </h3>
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-36">
          <label className="block text-xs text-gray-400 mb-1">Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username"
            className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors duration-150"
          />
        </div>
        <div className="flex-1 min-w-36">
          <label className="block text-xs text-gray-400 mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
            className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors duration-150"
          />
        </div>
        <div className="flex items-center gap-2 pb-0.5">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isAdmin}
              onChange={(e) => setIsAdmin(e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800"
            />
            <span className="text-sm text-gray-300 flex items-center gap-1">
              <Shield className="w-3.5 h-3.5 text-amber-400" />
              Admin
            </span>
          </label>
        </div>
        <button
          onClick={handleCreate}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors duration-150 disabled:opacity-50"
        >
          {loading ? (
            <svg className="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          ) : (
            <Plus className="w-4 h-4" />
          )}
          Create User
        </button>
      </div>
    </div>
  );
}

// ── Change Password Modal ────────────────────────────────────────────────────

interface ChangePasswordModalProps {
  username: string;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

function ChangePasswordModal({ username, onClose, onSuccess: onSuccessCb, onError: onErrorCb }: ChangePasswordModalProps) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!password) { onErrorCb('Password is required.'); return; }
    if (password !== confirm) { onErrorCb('Passwords do not match.'); return; }
    setLoading(true);
    try {
      await client.query(`SET PASSWORD FOR "${username}" = '${password}'`);
      onSuccessCb(`Password changed for "${username}".`);
      onClose();
    } catch (err: any) {
      onErrorCb(err?.message ?? 'Failed to change password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-gray-800 rounded-lg shadow-2xl border border-gray-700 w-full max-w-sm mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-100 mb-4 flex items-center gap-2">
          <Key className="w-5 h-5 text-blue-400" />
          Change Password
        </h3>
        <p className="text-xs text-gray-500 mb-4">for user <span className="text-blue-400 font-mono">{username}</span></p>
        <div className="flex flex-col gap-3">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" autoFocus
            className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors duration-150" />
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm password"
            className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors duration-150" />
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} disabled={loading} className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-md transition-colors duration-150 disabled:opacity-50">Cancel</button>
          <button onClick={handleSubmit} disabled={loading || !password || password !== confirm}
            className="px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors duration-150 disabled:opacity-50">
            Change Password
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Grant Privilege Modal ────────────────────────────────────────────────────

interface GrantPrivilegeModalProps {
  username: string;
  databases: string[];
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

function GrantPrivilegeModal({ username, databases, onClose, onSuccess: onSuccessCb, onError: onErrorCb }: GrantPrivilegeModalProps) {
  const [database, setDatabase] = useState(databases[0] ?? '');
  const [privilege, setPrivilege] = useState('ALL');
  const [loading, setLoading] = useState(false);

  const handleGrant = async () => {
    if (!database) { onErrorCb('Database is required.'); return; }
    setLoading(true);
    try {
      await client.query(`GRANT ${privilege} ON "${database}" TO "${username}"`);
      onSuccessCb(`Granted ${privilege} on "${database}" to "${username}".`);
      onClose();
    } catch (err: any) {
      onErrorCb(err?.message ?? 'Failed to grant privilege.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-gray-800 rounded-lg shadow-2xl border border-gray-700 w-full max-w-sm mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-100 mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-blue-400" />
          Grant Privilege
        </h3>
        <p className="text-xs text-gray-500 mb-4">to user <span className="text-blue-400 font-mono">{username}</span></p>
        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Database</label>
            <select value={database} onChange={(e) => setDatabase(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 transition-colors duration-150">
              {databases.map((db) => <option key={db} value={db}>{db}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Privilege</label>
            <select value={privilege} onChange={(e) => setPrivilege(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 transition-colors duration-150">
              <option value="ALL">ALL PRIVILEGES</option>
              <option value="READ">READ</option>
              <option value="WRITE">WRITE</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} disabled={loading} className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-md transition-colors duration-150 disabled:opacity-50">Cancel</button>
          <button onClick={handleGrant} disabled={loading}
            className="px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors duration-150 disabled:opacity-50">
            Grant
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tab 3: Users ──────────────────────────────────────────────────────────────

interface UsersTabProps {
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

function UsersTab({ onError, onSuccess }: UsersTabProps) {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDrop, setConfirmDrop] = useState<string | null>(null);
  const [changePasswordFor, setChangePasswordFor] = useState<string | null>(null);
  const [grantPrivilegeFor, setGrantPrivilegeFor] = useState<string | null>(null);
  const [databases, setDatabases] = useState<string[]>([]);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [userGrants, setUserGrants] = useState<Record<string, any[]>>({});
  const [grantsLoading, setGrantsLoading] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await client.getUsers();
      setUsers(Array.isArray(data) ? data : []);
    } catch (err: any) {
      onError(err?.message ?? 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  const fetchDatabases = useCallback(async () => {
    try { setDatabases(await client.getDatabases()); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchDatabases();
  }, [fetchUsers, fetchDatabases]);

  const handleDropUser = async (username: string) => {
    setConfirmDrop(null);
    try {
      await client.query(`DROP USER "${username}"`);
      onSuccess(`User "${username}" dropped successfully.`);
      fetchUsers();
    } catch (err: any) {
      onError(err?.message ?? `Failed to drop user "${username}".`);
    }
  };

  const toggleGrants = async (username: string) => {
    if (expandedUser === username) { setExpandedUser(null); return; }
    setExpandedUser(username);
    if (userGrants[username]) return;
    setGrantsLoading(username);
    try {
      const grants = await client.getUserGrants(username);
      setUserGrants((prev) => ({ ...prev, [username]: grants }));
    } catch (err: any) {
      onError(err?.message ?? `Failed to load grants for "${username}".`);
    } finally {
      setGrantsLoading(null);
    }
  };

  const handleRevoke = async (username: string, database: string, privilege: string) => {
    try {
      await client.query(`REVOKE ${privilege} ON "${database}" FROM "${username}"`);
      onSuccess(`Revoked ${privilege} on "${database}" from "${username}".`);
      // Refresh grants
      const grants = await client.getUserGrants(username);
      setUserGrants((prev) => ({ ...prev, [username]: grants }));
    } catch (err: any) {
      onError(err?.message ?? 'Failed to revoke privilege.');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-200 flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-400" />
          Users
        </h2>
        <button onClick={fetchUsers} disabled={loading} title="Refresh"
          className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 rounded-md border border-gray-700 transition-colors duration-150 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <CreateUserForm onCreated={fetchUsers} onError={onError} onSuccess={onSuccess} />

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-500">
          <svg className="w-5 h-5 animate-spin mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Loading users...
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No users found.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {users.map((user) => (
            <div key={user.user} className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-gray-100 text-sm">{user.user}</span>
                  {user.admin ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-900/60 text-amber-300 border border-amber-700">
                      <Shield className="w-3 h-3" /> Admin
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-gray-700 text-gray-400 border border-gray-600">User</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => toggleGrants(user.user)} title="View Grants"
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-md border border-gray-600 transition-colors duration-150">
                    <Eye className="w-3.5 h-3.5" />
                    Grants
                    {expandedUser === user.user ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  <button onClick={() => setChangePasswordFor(user.user)} title="Change Password"
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-md border border-gray-600 transition-colors duration-150">
                    <Key className="w-3.5 h-3.5" />
                    Password
                  </button>
                  <button onClick={() => { fetchDatabases(); setGrantPrivilegeFor(user.user); }} title="Grant Privilege"
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors duration-150">
                    <Shield className="w-3.5 h-3.5" />
                    Grant
                  </button>
                  <button onClick={() => setConfirmDrop(user.user)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors duration-150">
                    <Trash2 className="w-3.5 h-3.5" />
                    Drop
                  </button>
                </div>
              </div>
              {expandedUser === user.user && (
                <div className="border-t border-gray-700 px-4 py-3 bg-gray-850">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Database Grants</div>
                  {grantsLoading === user.user ? (
                    <div className="flex items-center gap-2 text-gray-500 text-xs py-2">
                      <svg className="w-3 h-3 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Loading grants...
                    </div>
                  ) : (userGrants[user.user] ?? []).length === 0 ? (
                    <p className="text-xs text-gray-500">No database-specific grants.</p>
                  ) : (
                    <div className="rounded border border-gray-700 overflow-hidden">
                      <table className="min-w-full text-xs">
                        <thead>
                          <tr className="bg-gray-800 border-b border-gray-700">
                            <th className="px-3 py-2 text-left font-semibold text-gray-400">Database</th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-400">Privilege</th>
                            <th className="px-3 py-2 text-right font-semibold text-gray-400">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(userGrants[user.user] ?? []).map((grant: any, gi: number) => (
                            <tr key={gi} className="border-b border-gray-700 last:border-0 hover:bg-gray-700/30 transition-colors duration-150">
                              <td className="px-3 py-2 font-mono text-blue-300">{grant.database}</td>
                              <td className="px-3 py-2 text-gray-300">{grant.privilege}</td>
                              <td className="px-3 py-2 text-right">
                                <button onClick={() => handleRevoke(user.user, grant.database, grant.privilege)}
                                  className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors duration-150">
                                  Revoke
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {confirmDrop && (
        <ConfirmModal title="Drop User" message={`Are you sure you want to drop the user "${confirmDrop}"? This action cannot be undone.`}
          confirmLabel="Drop User" onConfirm={() => handleDropUser(confirmDrop)} onCancel={() => setConfirmDrop(null)} />
      )}

      {changePasswordFor && (
        <ChangePasswordModal username={changePasswordFor} onClose={() => setChangePasswordFor(null)} onSuccess={onSuccess} onError={onError} />
      )}

      {grantPrivilegeFor && (
        <GrantPrivilegeModal username={grantPrivilegeFor} databases={databases} onClose={() => { setGrantPrivilegeFor(null); }}
          onSuccess={(msg) => { onSuccess(msg); if (expandedUser === grantPrivilegeFor) { client.getUserGrants(grantPrivilegeFor).then((g) => setUserGrants((p) => ({ ...p, [grantPrivilegeFor]: g }))).catch(() => {}); } }}
          onError={onError} />
      )}
    </div>
  );
}

// ── Tab 4: Usage Insights ─────────────────────────────────────────────────────

interface DatabaseInsight {
  name: string;
  seriesCardinality: number;
  measurementCount: number;
  rpCount: number;
  latestShardEnd: Date | null;
  staleDays: number | null;
  lastDataAt: string | null;
}

interface InsightsTabProps {
  onError: (msg: string) => void;
}

function InsightsTab({ onError }: InsightsTabProps) {
  const [insights, setInsights] = useState<DatabaseInsight[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);

  const runAnalysis = async () => {
    setLoading(true);
    setAnalyzed(false);
    try {
      const databases = await client.getDatabases();

      // Gather shard group info for staleness detection.
      let latestShardByDb: Record<string, Date> = {};
      try {
        const shardGroups = await client.getShardGroups();
        for (const sg of shardGroups) {
          const db = sg.database || sg.Database;
          const endTime = sg.end_time || sg['end time'] || sg.expiry_time;
          if (db && endTime) {
            const d = new Date(endTime);
            if (!isNaN(d.getTime()) && (!latestShardByDb[db] || d > latestShardByDb[db])) {
              latestShardByDb[db] = d;
            }
          }
        }
      } catch {
        // SHOW SHARD GROUPS may not be supported on all versions.
      }

      // Fetch per-DB stats in parallel.
      const results = await Promise.all(
        databases.map(async (name) => {
          let seriesCardinality = 0;
          let measurements: string[] = [];
          let rpCount = 0;
          try { seriesCardinality = await client.getSeriesCardinality(name); } catch { /* skip */ }
          try { measurements = await client.getMeasurements(name); } catch { /* skip */ }
          try { rpCount = (await client.getRetentionPolicies(name)).length; } catch { /* skip */ }

          // Sample up to 5 measurements to find the latest data point
          let lastDataAt: string | null = null;
          const sample = measurements.slice(0, 5);
          for (const m of sample) {
            try {
              const r = await client.query(`SELECT * FROM "${m}" ORDER BY time DESC LIMIT 1`, name, 'rfc3339');
              const s = r.results?.[0]?.series?.[0];
              if (s && s.values?.[0]) {
                const tIdx = s.columns.indexOf('time');
                const t = tIdx >= 0 ? String(s.values[0][tIdx]) : null;
                if (t && (!lastDataAt || t > lastDataAt)) lastDataAt = t;
              }
            } catch { /* skip */ }
          }

          const latestShard = latestShardByDb[name] || null;
          let staleDays: number | null = null;
          if (latestShard) {
            staleDays = Math.max(0, Math.floor((Date.now() - latestShard.getTime()) / (1000 * 60 * 60 * 24)));
          }

          return { name, seriesCardinality, measurementCount: measurements.length, rpCount, latestShardEnd: latestShard, staleDays, lastDataAt };
        }),
      );

      // Sort by series cardinality descending (most used first).
      results.sort((a, b) => b.seriesCardinality - a.seriesCardinality);
      setInsights(results);
      setAnalyzed(true);
    } catch (err: any) {
      onError(err?.message ?? 'Analysis failed.');
    } finally {
      setLoading(false);
    }
  };

  const formatStaleness = (db: DatabaseInsight) => {
    if (db.staleDays === null) return '—';
    if (db.staleDays === 0) return 'Today';
    if (db.staleDays === 1) return '1 day ago';
    return `${db.staleDays}d ago`;
  };

  const staleThreshold = 7; // days

  const totalSeries = insights.reduce((a, b) => a + b.seriesCardinality, 0);
  const totalMeasurements = insights.reduce((a, b) => a + b.measurementCount, 0);
  const staleCount = insights.filter((d) => d.staleDays !== null && d.staleDays > staleThreshold).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-200 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-blue-400" />
          Usage Insights
        </h2>
        <button
          onClick={runAnalysis}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors duration-150 disabled:opacity-50"
        >
          {loading ? (
            <svg className="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          ) : (
            <BarChart3 className="w-4 h-4" />
          )}
          {loading ? 'Analyzing...' : analyzed ? 'Re-analyze' : 'Analyze Usage'}
        </button>
      </div>

      {!analyzed && !loading && (
        <div className="text-center py-16 text-gray-500">
          <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Click "Analyze Usage" to scan all databases.</p>
          <p className="text-xs text-gray-600 mt-1">
            Queries each database for series cardinality, measurements, and shard groups.
          </p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16 text-gray-500">
          <svg className="w-5 h-5 animate-spin mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Analyzing databases... this may take a moment.
        </div>
      )}

      {analyzed && !loading && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <div className="bg-gray-800 rounded-lg border border-gray-700 px-4 py-3">
              <div className="text-xs text-gray-500 mb-1">Databases</div>
              <div className="text-lg font-bold text-gray-100">{insights.length}</div>
            </div>
            <div className="bg-gray-800 rounded-lg border border-gray-700 px-4 py-3">
              <div className="text-xs text-gray-500 mb-1">Total Series</div>
              <div className="text-lg font-bold text-gray-100">{totalSeries.toLocaleString()}</div>
            </div>
            <div className="bg-gray-800 rounded-lg border border-gray-700 px-4 py-3">
              <div className="text-xs text-gray-500 mb-1">Total Measurements</div>
              <div className="text-lg font-bold text-gray-100">{totalMeasurements.toLocaleString()}</div>
            </div>
            <div className="bg-gray-800 rounded-lg border border-gray-700 px-4 py-3">
              <div className="text-xs text-gray-500 mb-1">Stale ({'>'}7d)</div>
              <div className={`text-lg font-bold ${staleCount > 0 ? 'text-amber-400' : 'text-green-400'}`}>
                {staleCount}
              </div>
            </div>
          </div>

          {/* Table */}
          {insights.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Database className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No databases found.</p>
            </div>
          ) : (
            <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-gray-800 border-b border-gray-700">
                    <th className="px-4 py-3 text-left font-semibold text-gray-400">Database</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-400">Series</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-400">Measurements</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-400">RPs</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-400">Latest Shard</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-400">Last Data At</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-400">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {insights.map((db) => {
                    const isStale = db.staleDays !== null && db.staleDays > staleThreshold;
                    const isSystem = db.name === '_internal';
                    return (
                      <tr key={db.name} className="border-b border-gray-700 last:border-0 hover:bg-gray-700/30 transition-colors duration-150">
                        <td className="px-4 py-3 font-mono text-gray-100">
                          {db.name}
                          {isSystem && (
                            <span className="ml-2 text-[10px] text-gray-500 font-sans">(system)</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-300">
                          {db.seriesCardinality.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-300">
                          {db.measurementCount.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-300">
                          {db.rpCount}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-400 text-xs">
                          {formatStaleness(db)}
                        </td>
                        <td className="px-4 py-3 text-right text-xs font-mono">
                          {db.lastDataAt ? (
                            <span className="text-gray-300" title={db.lastDataAt}>
                              {(() => {
                                try {
                                  const d = new Date(db.lastDataAt);
                                  if (!isNaN(d.getTime())) return d.toLocaleString();
                                } catch { /* ignore */ }
                                return db.lastDataAt;
                              })()}
                            </span>
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isStale && !isSystem ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-900/60 text-amber-300 border border-amber-700">
                              <AlertTriangle className="w-3 h-3" />
                              Stale
                            </span>
                          ) : db.staleDays !== null ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-green-900/40 text-green-400 border border-green-800">
                              Active
                            </span>
                          ) : (
                            <span className="text-gray-600 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Tab 5: Subscriptions ──────────────────────────────────────────────────────

interface SubscriptionsTabProps {
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

function SubscriptionsTab({ onError, onSuccess }: SubscriptionsTabProps) {
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [databases, setDatabases] = useState<string[]>([]);
  const [confirmDrop, setConfirmDrop] = useState<{ name: string; db: string; rp: string } | null>(null);

  // Create subscription state
  const [createDb, setCreateDb] = useState('');
  const [createRp, setCreateRp] = useState('');
  const [createName, setCreateName] = useState('');
  const [createMode, setCreateMode] = useState('ANY');
  const [createDests, setCreateDests] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');

  const fetchSubscriptions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await client.getSubscriptions();
      setSubscriptions(data);
    } catch (err: any) {
      onError(err?.message ?? 'Failed to load subscriptions.');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  const fetchDatabases = useCallback(async () => {
    try { setDatabases(await client.getDatabases()); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchSubscriptions();
    fetchDatabases();
  }, [fetchSubscriptions, fetchDatabases]);

  const handleDropSubscription = async (name: string, db: string, rp: string) => {
    setConfirmDrop(null);
    try {
      await client.query(`DROP SUBSCRIPTION "${name}" ON "${db}"."${rp}"`);
      onSuccess(`Subscription "${name}" dropped.`);
      fetchSubscriptions();
    } catch (err: any) {
      onError(err?.message ?? `Failed to drop subscription "${name}".`);
    }
  };

  const handleCreate = async () => {
    if (!createName.trim()) { setCreateError('Subscription name is required.'); return; }
    if (!createDb) { setCreateError('Database is required.'); return; }
    if (!createRp.trim()) { setCreateError('Retention policy is required.'); return; }
    if (!createDests.trim()) { setCreateError('At least one destination is required.'); return; }
    setCreateLoading(true);
    setCreateError('');
    try {
      const destinations = createDests.split(',').map((d) => `'${d.trim()}'`).join(', ');
      await client.query(`CREATE SUBSCRIPTION "${createName.trim()}" ON "${createDb}"."${createRp.trim()}" DESTINATIONS ${createMode} ${destinations}`);
      onSuccess('Subscription created successfully.');
      setShowCreate(false);
      setCreateName(''); setCreateRp(''); setCreateDests('');
      fetchSubscriptions();
    } catch (err: any) {
      setCreateError(err?.message ?? 'Failed to create subscription.');
    } finally {
      setCreateLoading(false);
    }
  };

  const totalSubs = subscriptions.reduce((acc, s) => acc + (s.values?.length ?? 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-200 flex items-center gap-2">
          <Link className="w-5 h-5 text-blue-400" />
          Subscriptions
          {!loading && <span className="ml-1 text-xs font-normal text-gray-500">({totalSubs} total)</span>}
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={fetchSubscriptions} disabled={loading} title="Refresh"
            className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 rounded-md border border-gray-700 transition-colors duration-150 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => { fetchDatabases(); setShowCreate(true); }}
            className="flex items-center gap-2 px-3 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors duration-150">
            <Plus className="w-4 h-4" /> Create Subscription
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-500">
          <svg className="w-5 h-5 animate-spin mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Loading subscriptions...
        </div>
      ) : totalSubs === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Link className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No subscriptions found.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {subscriptions.filter((s) => s.values?.length > 0).map((series: any) => (
            <div key={series.name} className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-700 bg-gray-800">
                <Database className="w-4 h-4 text-blue-400 flex-shrink-0" />
                <span className="text-sm font-semibold text-gray-200 font-mono">{series.name}</span>
              </div>
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-gray-800 border-b border-gray-700">
                    {(series.columns ?? []).map((col: string) => (
                      <th key={col} className="px-4 py-2 text-left font-semibold text-gray-400">{col}</th>
                    ))}
                    <th className="px-4 py-2 text-right font-semibold text-gray-400 w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(series.values ?? []).map((row: any[], ri: number) => {
                    const nameIdx = (series.columns ?? []).indexOf('name');
                    const rpIdx = (series.columns ?? []).indexOf('retention_policy');
                    return (
                      <tr key={ri} className="border-b border-gray-700 last:border-0 hover:bg-gray-700/30 transition-colors duration-150">
                        {row.map((val: any, ci: number) => (
                          <td key={ci} className="px-4 py-2.5 text-gray-300 font-mono break-all">{String(val ?? '')}</td>
                        ))}
                        <td className="px-4 py-2.5 text-right">
                          <button onClick={() => setConfirmDrop({ name: row[nameIdx] ?? '', db: series.name, rp: row[rpIdx] ?? '' })}
                            className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors duration-150">
                            Drop
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {confirmDrop && (
        <ConfirmModal title="Drop Subscription" message={`Drop subscription "${confirmDrop.name}" on "${confirmDrop.db}"."${confirmDrop.rp}"?`}
          confirmLabel="Drop" onConfirm={() => handleDropSubscription(confirmDrop.name, confirmDrop.db, confirmDrop.rp)}
          onCancel={() => setConfirmDrop(null)} />
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-gray-800 rounded-lg shadow-2xl border border-gray-700 w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-100 mb-4 flex items-center gap-2">
              <Link className="w-5 h-5 text-blue-400" /> Create Subscription
            </h3>
            {createError && (
              <div className="bg-red-950/60 border border-red-700 rounded-md px-3 py-2 mb-4 text-sm text-red-300 font-mono">{createError}</div>
            )}
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Subscription Name</label>
                <input type="text" value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="my_subscription" autoFocus
                  className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors duration-150" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Database</label>
                <select value={createDb} onChange={(e) => setCreateDb(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 transition-colors duration-150">
                  <option value="">Select database</option>
                  {databases.map((db) => <option key={db} value={db}>{db}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Retention Policy</label>
                <input type="text" value={createRp} onChange={(e) => setCreateRp(e.target.value)} placeholder="autogen"
                  className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors duration-150" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Mode</label>
                <select value={createMode} onChange={(e) => setCreateMode(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 transition-colors duration-150">
                  <option value="ANY">ANY</option>
                  <option value="ALL">ALL</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Destinations <span className="text-xs text-gray-500">(comma-separated URIs)</span></label>
                <input type="text" value={createDests} onChange={(e) => setCreateDests(e.target.value)} placeholder="udp://host1:9090, udp://host2:9090"
                  className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors duration-150" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowCreate(false)} disabled={createLoading}
                className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-md transition-colors duration-150 disabled:opacity-50">Cancel</button>
              <button onClick={handleCreate} disabled={createLoading}
                className="px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors duration-150 disabled:opacity-50">
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab 6: Privilege Matrix ──────────────────────────────────────────────────

interface PrivilegesTabProps {
  onError: (msg: string) => void;
}

function PrivilegesTab({ onError }: PrivilegesTabProps) {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [databases, setDatabases] = useState<string[]>([]);
  const [matrix, setMatrix] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadMatrix = async () => {
    setLoading(true);
    try {
      const [userList, dbList] = await Promise.all([client.getUsers(), client.getDatabases()]);
      setUsers(Array.isArray(userList) ? userList : []);
      setDatabases(dbList);

      const m: Record<string, Record<string, string>> = {};
      await Promise.all(
        (userList ?? []).map(async (u: any) => {
          try {
            const grants = await client.getUserGrants(u.user);
            const dbGrants: Record<string, string> = {};
            for (const g of grants) {
              dbGrants[g.database] = g.privilege;
            }
            m[u.user] = dbGrants;
          } catch {
            m[u.user] = {};
          }
        }),
      );
      setMatrix(m);
      setLoaded(true);
    } catch (err: any) {
      onError(err?.message ?? 'Failed to load privilege matrix.');
    } finally {
      setLoading(false);
    }
  };

  const privilegeColor = (priv: string) => {
    if (!priv || priv === 'NO PRIVILEGES') return 'text-gray-600';
    if (priv === 'ALL PRIVILEGES') return 'text-green-400';
    if (priv === 'READ') return 'text-blue-400';
    if (priv === 'WRITE') return 'text-amber-400';
    return 'text-gray-300';
  };

  const privilegeLabel = (priv: string) => {
    if (!priv || priv === 'NO PRIVILEGES') return '-';
    if (priv === 'ALL PRIVILEGES') return 'ALL';
    return priv;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-200 flex items-center gap-2">
          <Shield className="w-5 h-5 text-blue-400" />
          Privilege Matrix
        </h2>
        <button onClick={loadMatrix} disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors duration-150 disabled:opacity-50">
          {loading ? (
            <svg className="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          ) : <RefreshCw className="w-4 h-4" />}
          {loading ? 'Loading...' : loaded ? 'Refresh' : 'Load Matrix'}
        </button>
      </div>

      {!loaded && !loading && (
        <div className="text-center py-16 text-gray-500">
          <Shield className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Click "Load Matrix" to view the per-database privilege grid.</p>
          <p className="text-xs text-gray-600 mt-1">Shows SHOW GRANTS for each user across all databases.</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16 text-gray-500">
          <svg className="w-5 h-5 animate-spin mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Loading privilege matrix...
        </div>
      )}

      {loaded && !loading && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-gray-800 border-b border-gray-700">
                <th className="px-4 py-3 text-left font-semibold text-gray-400 sticky left-0 bg-gray-800 z-10">User</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-400">Admin</th>
                {databases.map((db) => (
                  <th key={db} className="px-4 py-3 text-center font-semibold text-gray-400 font-mono whitespace-nowrap">{db}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.user} className="border-b border-gray-700 last:border-0 hover:bg-gray-700/30 transition-colors duration-150">
                  <td className="px-4 py-3 font-mono text-gray-100 sticky left-0 bg-gray-800">{user.user}</td>
                  <td className="px-4 py-3 text-center">
                    {user.admin ? (
                      <span className="text-amber-400 font-semibold">Yes</span>
                    ) : (
                      <span className="text-gray-600">No</span>
                    )}
                  </td>
                  {databases.map((db) => {
                    const priv = matrix[user.user]?.[db] ?? '';
                    return (
                      <td key={db} className={`px-4 py-3 text-center font-semibold ${privilegeColor(priv)}`}>
                        {privilegeLabel(priv)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

const TABS: { id: ActiveTab; label: string }[] = [
  { id: 'databases', label: 'Databases & RPs' },
  { id: 'continuous_queries', label: 'Continuous Queries' },
  { id: 'users', label: 'Users' },
  { id: 'subscriptions', label: 'Subscriptions' },
  { id: 'privileges', label: 'Privileges' },
  { id: 'insights', label: 'Usage Insights' },
];

export default function DatabaseAdmin() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('databases');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  // Re-mount active tab when connection changes
  useEffect(() => {
    const handler = () => { setRefreshKey((k) => k + 1); setError(''); setSuccess(''); };
    window.addEventListener('tidedb-connection-change', handler);
    return () => window.removeEventListener('tidedb-connection-change', handler);
  }, []);

  const handleError = useCallback((msg: string) => {
    setError(msg);
    setSuccess('');
  }, []);

  const handleSuccess = useCallback((msg: string) => {
    setSuccess(msg);
    setError('');
  }, []);

  return (
    <div className="min-h-full bg-gray-950 text-gray-100">
      {/* Page header */}
      <div className="border-b border-gray-800 px-6 py-4">
        <h1 className="text-xl font-bold text-gray-100 flex items-center gap-2">
          <Database className="w-6 h-6 text-blue-400" />
          Database Administration
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage databases, retention policies, continuous queries, and users.</p>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-6 pt-4 pb-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              setError('');
              setSuccess('');
            }}
            className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors duration-150 ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="px-6 py-5">
        {/* Banners */}
        {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
        {success && <SuccessBanner message={success} onDismiss={() => setSuccess('')} />}

        {activeTab === 'databases' && (
          <DatabasesTab key={refreshKey} onError={handleError} onSuccess={handleSuccess} />
        )}
        {activeTab === 'continuous_queries' && (
          <ContinuousQueriesTab key={refreshKey} onError={handleError} onSuccess={handleSuccess} />
        )}
        {activeTab === 'users' && (
          <UsersTab key={refreshKey} onError={handleError} onSuccess={handleSuccess} />
        )}
        {activeTab === 'subscriptions' && (
          <SubscriptionsTab key={refreshKey} onError={handleError} onSuccess={handleSuccess} />
        )}
        {activeTab === 'privileges' && (
          <PrivilegesTab key={refreshKey} onError={handleError} />
        )}
        {activeTab === 'insights' && (
          <InsightsTab key={refreshKey} onError={handleError} />
        )}
      </div>
    </div>
  );
}
