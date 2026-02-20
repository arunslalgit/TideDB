import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Plus, Trash2, AlertTriangle, Camera } from 'lucide-react';
import { useActiveConnection } from '../../hooks/useActiveConnection';
import { listSnapshots, createSnapshot, deleteSnapshot, deleteAllSnapshots } from '../../api/victoriametrics';

export default function VmSnapshots() {
  const { connection, auth } = useActiveConnection();
  const [snapshots, setSnapshots] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [lastCreated, setLastCreated] = useState<string | null>(null);

  const fetchSnapshots = useCallback(async () => {
    if (!connection || connection.type !== 'victoriametrics') return;
    setLoading(true);
    setError(null);
    try {
      const snaps = await listSnapshots(connection.url, auth);
      setSnapshots(snaps);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [connection, auth]);

  useEffect(() => { fetchSnapshots(); }, [fetchSnapshots]);

  const handleCreate = async () => {
    if (!connection) return;
    setCreating(true);
    setError(null);
    try {
      const name = await createSnapshot(connection.url, auth);
      setLastCreated(name);
      await fetchSnapshots();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (name: string) => {
    if (!connection) return;
    setDeleting(name);
    try {
      await deleteSnapshot(connection.url, name, auth);
      await fetchSnapshots();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeleting(null);
    }
  };

  const handleDeleteAll = async () => {
    if (!connection) return;
    setConfirmDeleteAll(false);
    setLoading(true);
    try {
      await deleteAllSnapshots(connection.url, auth);
      await fetchSnapshots();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!connection || connection.type !== 'victoriametrics') {
    return <div className="flex items-center justify-center h-full text-gray-500"><p>Select a VictoriaMetrics connection.</p></div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-white flex items-center gap-2">
          <Camera size={18} className="text-blue-400" />
          Snapshots
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCreate}
            disabled={creating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors disabled:opacity-40"
          >
            <Plus size={12} />
            {creating ? 'Creating...' : 'Create Snapshot'}
          </button>
          <button onClick={fetchSnapshots} disabled={loading} className="p-2 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded bg-red-900/30 border border-red-800 text-red-300 text-sm">
          {error}
          {error.includes('unsupported path') && (
            <p className="mt-1 text-xs text-red-400">
              Snapshots are only available on single-node VictoriaMetrics. In cluster mode, snapshots must be managed on vmstorage nodes directly.
            </p>
          )}
        </div>
      )}

      {lastCreated && (
        <div className="p-3 rounded bg-green-900/20 border border-green-800/50 text-green-300 text-sm">
          Snapshot created: <code className="font-mono text-green-200">{lastCreated}</code>
        </div>
      )}

      {/* Snapshot List */}
      <div className="rounded-lg border border-gray-800 overflow-hidden">
        <div className="px-4 py-3 bg-gray-900 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-sm font-medium text-white">
            Existing Snapshots <span className="text-gray-500">({snapshots.length})</span>
          </h2>
          {snapshots.length > 1 && (
            <button
              onClick={() => setConfirmDeleteAll(true)}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs text-red-400 hover:bg-red-900/20 transition-colors"
            >
              <Trash2 size={10} />
              Delete All
            </button>
          )}
        </div>
        {snapshots.length > 0 ? (
          <div className="divide-y divide-gray-800/50">
            {snapshots.map((snap) => (
              <div key={snap} className="px-4 py-3 flex items-center justify-between hover:bg-gray-900/50">
                <div>
                  <p className="text-sm font-mono text-gray-200">{snap}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Path: &lt;storageDataPath&gt;/snapshots/{snap}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(snap)}
                  disabled={deleting === snap}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs text-red-400 hover:bg-red-900/20 transition-colors disabled:opacity-40"
                >
                  <Trash2 size={10} />
                  {deleting === snap ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-gray-500 text-sm">No snapshots found</div>
        )}
      </div>

      {/* Confirm Delete All Dialog */}
      {confirmDeleteAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gray-900 rounded-lg border border-gray-700 p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={20} className="text-red-400" />
              <h3 className="text-sm font-semibold text-white">Delete All Snapshots?</h3>
            </div>
            <p className="text-xs text-gray-400 mb-4">
              This will permanently delete all {snapshots.length} snapshots. This action cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDeleteAll(false)} className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs">
                Cancel
              </button>
              <button onClick={handleDeleteAll} className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white text-xs font-medium">
                Delete All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="rounded-lg border border-gray-800 p-4 bg-gray-900/30">
        <p className="text-xs text-gray-500">
          Snapshots are created in <code className="text-gray-400">&lt;storageDataPath&gt;/snapshots/</code>.
          Use <code className="text-gray-400">vmbackup</code> to archive snapshots to S3/GCS.
          Snapshots must be deleted via this API, not with <code className="text-gray-400">rm -rf</code>.
        </p>
      </div>
    </div>
  );
}
