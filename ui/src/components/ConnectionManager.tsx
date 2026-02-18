import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Check, X, Server, ChevronDown, ChevronUp, Pencil } from 'lucide-react';
import { client, type RemoteConnection } from '../api/client';

// ── Persisted connection (has a name + id on top of RemoteConnection) ────────

export interface SavedConnection extends RemoteConnection {
  id: string;
  name: string;
}

const STORAGE_KEY = 'tidedb-connections';
const ACTIVE_KEY = 'tidedb-active-connection';

function loadConnections(): SavedConnection[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveConnections(conns: SavedConnection[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conns));
}

function loadActiveId(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}

function saveActiveId(id: string | null) {
  if (id) localStorage.setItem(ACTIVE_KEY, id);
  else localStorage.removeItem(ACTIVE_KEY);
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── Component ────────────────────────────────────────────────────────────────

interface ConnectionManagerProps {
  onConnectionChange: () => void;
  defaultUrl?: string;
}

export default function ConnectionManager({ onConnectionChange, defaultUrl }: ConnectionManagerProps) {
  const [connections, setConnections] = useState<SavedConnection[]>(loadConnections);
  const [activeId, setActiveId] = useState<string | null>(loadActiveId);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); // null = not editing, 'new' = adding

  // Form fields
  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formUser, setFormUser] = useState('');
  const [formPass, setFormPass] = useState('');

  // If there's a defaultUrl from the server and no connections saved, auto-add it.
  useEffect(() => {
    if (defaultUrl && connections.length === 0) {
      const conn: SavedConnection = {
        id: generateId(),
        name: 'Default',
        url: defaultUrl,
        username: '',
        password: '',
      };
      const updated = [conn];
      setConnections(updated);
      saveConnections(updated);
      setActiveId(conn.id);
      saveActiveId(conn.id);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync active connection to client whenever it changes.
  const syncToClient = useCallback((conns: SavedConnection[], id: string | null) => {
    const active = conns.find((c) => c.id === id) || null;
    if (active) {
      client.setRemoteConnection({ url: active.url, username: active.username, password: active.password });
    } else {
      client.setRemoteConnection(null);
    }
    onConnectionChange();
  }, [onConnectionChange]);

  // On mount, sync.
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
    setEditingId(null);
  };

  const startAdd = () => {
    setFormName('');
    setFormUrl('');
    setFormUser('');
    setFormPass('');
    setEditingId('new');
  };

  const startEdit = (conn: SavedConnection) => {
    setFormName(conn.name);
    setFormUrl(conn.url);
    setFormUser(conn.username);
    setFormPass(conn.password);
    setEditingId(conn.id);
  };

  const saveForm = () => {
    const trimmedName = formName.trim() || 'Untitled';
    const trimmedUrl = formUrl.trim();
    if (!trimmedUrl) return;

    if (editingId === 'new') {
      const conn: SavedConnection = {
        id: generateId(),
        name: trimmedName,
        url: trimmedUrl,
        username: formUser,
        password: formPass,
      };
      const updated = [...connections, conn];
      setConnections(updated);
      saveConnections(updated);
      // Auto-activate if it's the first connection.
      if (updated.length === 1 || !activeId) {
        setActiveId(conn.id);
        saveActiveId(conn.id);
        syncToClient(updated, conn.id);
      }
    } else {
      const updated = connections.map((c) =>
        c.id === editingId
          ? { ...c, name: trimmedName, url: trimmedUrl, username: formUser, password: formPass }
          : c,
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

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between w-full px-3 py-2 text-xs font-medium text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors duration-150"
      >
        <span className="flex items-center gap-1.5 truncate">
          <Server size={12} className="flex-shrink-0" />
          {activeConn ? activeConn.name : 'Connections'}
        </span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <div className="mt-1 px-1 space-y-1">
          {/* Connection list */}
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
                title={conn.url}
              >
                <span className="font-medium">{conn.name}</span>
                <span className="block text-gray-500 truncate text-[10px]">{conn.url}</span>
              </button>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button
                  onClick={() => startEdit(conn)}
                  className="p-1 text-gray-500 hover:text-gray-200 transition-colors"
                  title="Edit"
                >
                  <Pencil size={10} />
                </button>
                <button
                  onClick={() => removeConnection(conn.id)}
                  className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                  title="Remove"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            </div>
          ))}

          {/* Add / Edit form */}
          {editingId ? (
            <div className="space-y-1.5 pt-1 border-t border-gray-700 mt-1">
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
                placeholder="URL (e.g. http://localhost:8086)"
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
