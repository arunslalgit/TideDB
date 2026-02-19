import { useState, useCallback, useEffect } from 'react';
import { AlertTriangle, Trash2, RefreshCw, Zap, Database } from 'lucide-react';
import { useActiveConnection } from '../../hooks/useActiveConnection';
import { getSeriesCount, forceMerge, resetCache, deleteSeries } from '../../api/victoriametrics';
import prometheusClient from '../../api/prometheus';

export default function VmAdmin() {
  const { connection, auth } = useActiveConnection();
  const [seriesCount, setSeriesCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Delete series
  const [deleteMatch, setDeleteMatch] = useState('');
  const [previewSeries, setPreviewSeries] = useState<string[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Force merge
  const [partition, setPartition] = useState('');
  const [merging, setMerging] = useState(false);
  const [confirmMerge, setConfirmMerge] = useState(false);

  // Cache reset
  const [resettingCache, setResettingCache] = useState(false);

  const fetchSeriesCount = useCallback(async () => {
    if (!connection || connection.type !== 'victoriametrics') return;
    try {
      const count = await getSeriesCount(connection.url, auth);
      setSeriesCount(count);
    } catch {
      // ignore
    }
  }, [connection, auth]);

  useEffect(() => { fetchSeriesCount(); }, [fetchSeriesCount]);

  const handlePreview = async () => {
    if (!connection || !deleteMatch.trim()) return;
    setPreviewing(true);
    setError(null);
    try {
      const resp = await prometheusClient.getSeries(connection.url, [deleteMatch.trim()], auth);
      if (resp.status === 'success') {
        const names = resp.data.map((s: Record<string, string>) => {
          const name = s.__name__ || '';
          const labels = Object.entries(s).filter(([k]) => k !== '__name__').map(([k, v]) => `${k}="${v}"`).join(', ');
          return labels ? `${name}{${labels}}` : name;
        });
        setPreviewSeries(names.slice(0, 100));
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPreviewing(false);
    }
  };

  const handleDelete = async () => {
    if (!connection || !deleteMatch.trim()) return;
    setConfirmDelete(false);
    setDeleting(true);
    setError(null);
    setSuccess(null);
    try {
      await deleteSeries(connection.url, deleteMatch.trim(), auth);
      setSuccess(`Series matching "${deleteMatch}" have been deleted. Run force merge on affected partitions to reclaim disk space.`);
      setPreviewSeries([]);
      setDeleteMatch('');
      await fetchSeriesCount();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleForceMerge = async () => {
    if (!connection || !partition.trim()) return;
    setConfirmMerge(false);
    setMerging(true);
    setError(null);
    setSuccess(null);
    try {
      await forceMerge(connection.url, partition.trim(), auth);
      setSuccess(`Force merge triggered for partition ${partition}. This runs in the background.`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setMerging(false);
    }
  };

  const handleResetCache = async () => {
    if (!connection) return;
    setResettingCache(true);
    setError(null);
    setSuccess(null);
    try {
      await resetCache(connection.url, auth);
      setSuccess('Rollup result cache has been reset.');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setResettingCache(false);
    }
  };

  if (!connection || connection.type !== 'victoriametrics') {
    return <div className="flex items-center justify-center h-full text-gray-500"><p>Select a VictoriaMetrics connection.</p></div>;
  }

  // Generate partition options (last 12 months)
  const partitionOptions: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    partitionOptions.push(`${d.getFullYear()}_${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <h1 className="text-lg font-semibold text-white">Admin Operations</h1>

      {error && <div className="p-3 rounded bg-red-900/30 border border-red-800 text-red-300 text-sm">{error}</div>}
      {success && <div className="p-3 rounded bg-green-900/20 border border-green-800/50 text-green-300 text-sm">{success}</div>}

      {/* Series Management */}
      <div className="rounded-lg border border-gray-800 p-4 space-y-4">
        <h2 className="text-sm font-medium text-white flex items-center gap-2">
          <Database size={14} className="text-blue-400" />
          Series Management
        </h2>
        {seriesCount !== null && (
          <p className="text-xs text-gray-400">
            Total Series: <span className="text-white font-medium">{seriesCount.toLocaleString()}</span>
          </p>
        )}
        <div>
          <label className="text-xs text-gray-500 block mb-1">Delete Series Matching</label>
          <input
            type="text"
            value={deleteMatch}
            onChange={(e) => setDeleteMatch(e.target.value)}
            placeholder='{__name__="old_metric_name"}'
            className="w-full px-3 py-2 rounded bg-gray-800 border border-gray-700 text-gray-200 text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={handlePreview}
            disabled={previewing || !deleteMatch.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium transition-colors disabled:opacity-40"
          >
            {previewing ? 'Loading...' : 'Preview (dry run)'}
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={deleting || !deleteMatch.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white text-xs font-medium transition-colors disabled:opacity-40"
          >
            <Trash2 size={12} />
            {deleting ? 'Deleting...' : 'Delete Series'}
          </button>
        </div>
        {previewSeries.length > 0 && (
          <div className="rounded border border-gray-800 bg-gray-900/50 p-3 max-h-48 overflow-auto">
            <p className="text-xs text-gray-400 mb-2">Found {previewSeries.length} matching series{previewSeries.length >= 100 ? ' (showing first 100)' : ''}:</p>
            {previewSeries.map((s, i) => (
              <p key={i} className="text-xs font-mono text-gray-300 truncate">{s}</p>
            ))}
          </div>
        )}
      </div>

      {/* Force Merge */}
      <div className="rounded-lg border border-gray-800 p-4 space-y-4">
        <h2 className="text-sm font-medium text-white flex items-center gap-2">
          <Zap size={14} className="text-yellow-400" />
          Force Merge
        </h2>
        <div className="p-3 rounded bg-yellow-900/20 border border-yellow-800/50 text-yellow-300 text-xs">
          <AlertTriangle size={12} className="inline mr-1" />
          Force merge consumes additional CPU, disk IO, and storage space. Only use to reclaim space after deleting series from old partitions.
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Partition (YYYY_MM)</label>
          <select
            value={partition}
            onChange={(e) => setPartition(e.target.value)}
            className="px-3 py-2 rounded bg-gray-800 border border-gray-700 text-gray-300 text-sm"
          >
            <option value="">Select partition...</option>
            {partitionOptions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <button
          onClick={() => setConfirmMerge(true)}
          disabled={merging || !partition}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-yellow-600 hover:bg-yellow-500 text-white text-xs font-medium transition-colors disabled:opacity-40"
        >
          <Zap size={12} />
          {merging ? 'Merging...' : 'Trigger Force Merge'}
        </button>
      </div>

      {/* Cache Management */}
      <div className="rounded-lg border border-gray-800 p-4 space-y-3">
        <h2 className="text-sm font-medium text-white flex items-center gap-2">
          <RefreshCw size={14} className="text-green-400" />
          Cache Management
        </h2>
        <p className="text-xs text-gray-500">
          Reset the rollup result cache. Recommended after backfilling data so new data is reflected in query results.
        </p>
        <button
          onClick={handleResetCache}
          disabled={resettingCache}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-green-600 hover:bg-green-500 text-white text-xs font-medium transition-colors disabled:opacity-40"
        >
          <RefreshCw size={12} className={resettingCache ? 'animate-spin' : ''} />
          {resettingCache ? 'Resetting...' : 'Reset Rollup Result Cache'}
        </button>
      </div>

      {/* Confirmation dialogs */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gray-900 rounded-lg border border-gray-700 p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={20} className="text-red-400" />
              <h3 className="text-sm font-semibold text-white">Delete Series?</h3>
            </div>
            <p className="text-xs text-gray-400 mb-2">This will delete all series matching:</p>
            <code className="block text-xs text-red-300 font-mono bg-gray-800 p-2 rounded mb-4">{deleteMatch}</code>
            <p className="text-xs text-gray-500 mb-4">This action cannot be undone. You may need to run force merge afterward to reclaim disk space.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs">Cancel</button>
              <button onClick={handleDelete} className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white text-xs font-medium">Delete</button>
            </div>
          </div>
        </div>
      )}
      {confirmMerge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gray-900 rounded-lg border border-gray-700 p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={20} className="text-yellow-400" />
              <h3 className="text-sm font-semibold text-white">Trigger Force Merge?</h3>
            </div>
            <p className="text-xs text-gray-400 mb-4">
              This will trigger a force merge on partition <strong className="text-white">{partition}</strong>.
              This consumes additional CPU and disk IO resources.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmMerge(false)} className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs">Cancel</button>
              <button onClick={handleForceMerge} className="px-3 py-1.5 rounded bg-yellow-600 hover:bg-yellow-500 text-white text-xs font-medium">Merge</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
