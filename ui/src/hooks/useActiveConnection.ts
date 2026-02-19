import { useState, useEffect } from 'react';
import type { SavedConnection } from '../components/ConnectionManager';

const STORAGE_KEY = 'timeseriesui_connections';
const ACTIVE_KEY = 'timeseriesui_active_connection';

function getActive(): SavedConnection | null {
  try {
    const activeId = localStorage.getItem(ACTIVE_KEY) || localStorage.getItem('tidedb-active-connection');
    if (!activeId) return null;
    const data = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('tidedb-connections');
    const conns: SavedConnection[] = JSON.parse(data || '[]');
    return conns.find((c) => c.id === activeId) || null;
  } catch {
    return null;
  }
}

export function useActiveConnection() {
  const [conn, setConn] = useState<SavedConnection | null>(getActive);

  useEffect(() => {
    const handler = () => setConn(getActive());
    window.addEventListener('tidedb-connection-change', handler);
    return () => window.removeEventListener('tidedb-connection-change', handler);
  }, []);

  const auth = conn?.username
    ? { username: conn.username, password: conn.password || '' }
    : undefined;

  return { connection: conn, auth };
}
