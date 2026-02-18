import React, { useState, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { Terminal, Database, PenLine, Activity, Menu, X, ChevronDown, ChevronUp, Circle } from 'lucide-react';
import { client } from '../api/client';
import ConnectionManager from './ConnectionManager';

interface LayoutProps {
  children: React.ReactNode;
}

interface Credentials {
  username: string;
  password: string;
}

const navLinks = [
  { to: '/explore', label: 'Explore', icon: Terminal },
  { to: '/admin', label: 'Admin', icon: Database },
  { to: '/write', label: 'Write', icon: PenLine },
  { to: '/health', label: 'Health', icon: Activity },
];

export default function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [credentials, setCredentials] = useState<Credentials>({ username: '', password: '' });

  // Standalone mode (tidedb-ui binary) vs embedded mode (full TideDB server).
  const [standaloneMode, setStandaloneMode] = useState(false);
  const [defaultUrl, setDefaultUrl] = useState<string | undefined>(undefined);
  const [modeChecked, setModeChecked] = useState(false);

  // Check /api/mode on mount to detect standalone mode.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/mode');
        if (res.ok) {
          const data = await res.json();
          if (data.mode === 'standalone') {
            setStandaloneMode(true);
            client.setStandaloneMode(true);
            if (data.defaultUrl) setDefaultUrl(data.defaultUrl);
          }
        }
      } catch {
        // Not standalone — embedded mode.
      }
      setModeChecked(true);
    })();
  }, []);

  // Ping loop — re-pings whenever connection changes.
  const doPing = useCallback(async () => {
    try {
      const response = await client.ping();
      setVersion(response.version);
      setConnected(response.ok);
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    if (!modeChecked) return;
    doPing();
    const interval = setInterval(doPing, 10000);
    return () => clearInterval(interval);
  }, [modeChecked, doPing]);

  // Called by ConnectionManager when the active connection changes.
  const handleConnectionChange = useCallback(() => {
    // Immediately re-ping the new connection.
    doPing();
  }, [doPing]);

  function handleCredentialChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setCredentials((prev) => ({ ...prev, [name]: value }));
  }

  function handleCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault();
    client.setCredentials(credentials.username, credentials.password);
    doPing();
  }

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo / Name */}
      <div className="px-5 py-5 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-blue-600 flex items-center justify-center flex-shrink-0">
            <Database size={15} className="text-white" />
          </div>
          <div>
            <span className="text-white font-semibold text-base leading-tight block">TideDB</span>
            {version && version !== 'unknown' && (
              <span className="text-gray-500 text-xs leading-tight block">v{version}</span>
            )}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navLinks.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-150',
                isActive
                  ? 'bg-gray-800 text-white border-l-2 border-blue-500 pl-[10px]'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800 border-l-2 border-transparent pl-[10px]',
              ].join(' ')
            }
          >
            <Icon size={16} className="flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Bottom: connections/credentials + status */}
      <div className="border-t border-gray-800 px-3 py-4 space-y-3">
        {standaloneMode ? (
          /* Standalone mode — show connection manager */
          <ConnectionManager
            onConnectionChange={handleConnectionChange}
            defaultUrl={defaultUrl}
          />
        ) : (
          /* Embedded mode — show credentials form */
          <div>
            <button
              onClick={() => setCredentialsOpen((o) => !o)}
              className="flex items-center justify-between w-full px-3 py-2 text-xs font-medium text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors duration-150"
            >
              <span>Credentials</span>
              {credentialsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {credentialsOpen && (
              <form onSubmit={handleCredentialsSubmit} className="mt-2 px-1 space-y-2">
                <input
                  type="text"
                  name="username"
                  placeholder="Username"
                  value={credentials.username}
                  onChange={handleCredentialChange}
                  autoComplete="username"
                  className="w-full px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-200 text-xs placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
                <input
                  type="password"
                  name="password"
                  placeholder="Password"
                  value={credentials.password}
                  onChange={handleCredentialChange}
                  autoComplete="current-password"
                  className="w-full px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-200 text-xs placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
                <button
                  type="submit"
                  className="w-full py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors duration-150"
                >
                  Apply
                </button>
              </form>
            )}
          </div>
        )}

        {/* Connection status */}
        <div className="flex items-center gap-2 px-3 py-2">
          <Circle
            size={8}
            className={connected ? 'fill-green-500 text-green-500' : 'fill-red-500 text-red-500'}
          />
          <span className="text-xs text-gray-400">
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — desktop (always visible) + mobile (drawer) */}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-30 w-60 bg-gray-900 flex flex-col transition-transform duration-200 ease-in-out',
          'lg:static lg:translate-x-0 lg:flex-shrink-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        {sidebarContent}
      </aside>

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-gray-900 border-b border-gray-800 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <span className="text-white font-semibold text-sm">TideDB</span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto bg-gray-950">
          {children}
        </main>
      </div>
    </div>
  );
}
