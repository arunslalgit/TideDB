import React, { useState, useEffect, useCallback } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Terminal, Database, PenLine, Activity, Menu, X,
  Circle, Crosshair, Bell, BellOff, HardDrive,
  LayoutList, FileCode, Radar, Zap,
  ArrowDownUp, Camera, Shield,
} from 'lucide-react';
import { client } from '../api/client';
import { basePath } from '../config';
import ConnectionManager, { type SavedConnection } from './ConnectionManager';

interface LayoutProps {
  children: React.ReactNode;
}

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  section?: string;
}

const influxNavLinks: NavItem[] = [
  { to: '/influxdb/query', label: 'Query Explorer', icon: Terminal },
  { to: '/influxdb/admin', label: 'Admin', icon: Database },
  { to: '/influxdb/write', label: 'Write Data', icon: PenLine },
  { to: '/influxdb/health', label: 'System Health', icon: Activity },
];

const prometheusNavLinks: NavItem[] = [
  { to: '/prometheus/query', label: 'Query Explorer', icon: Terminal, section: 'QUERY' },
  { to: '/prometheus/targets', label: 'Targets', icon: Crosshair, section: 'MONITORING' },
  { to: '/prometheus/alerts', label: 'Alert Rules', icon: Bell, section: 'ALERTING' },
  { to: '/prometheus/tsdb', label: 'TSDB Status', icon: HardDrive, section: 'STATUS' },
  { to: '/prometheus/metrics', label: 'Metrics Explorer', icon: LayoutList },
  { to: '/prometheus/config', label: 'Config', icon: FileCode },
  { to: '/prometheus/service-discovery', label: 'Service Discovery', icon: Radar },
];

const prometheusAMLink: NavItem = {
  to: '/prometheus/alertmanager',
  label: 'Alertmanager',
  icon: BellOff,
};

function getVmNavLinks(conn: SavedConnection): NavItem[] {
  const links: NavItem[] = [
    { to: '/victoriametrics/query', label: 'Query Explorer', icon: Terminal, section: 'QUERY' },
    { to: '/victoriametrics/metrics', label: 'Metrics Explorer', icon: LayoutList },
    { to: '/victoriametrics/targets', label: 'Targets', icon: Crosshair, section: 'MONITORING' },
    { to: '/victoriametrics/service-discovery', label: 'Service Discovery', icon: Radar },
    { to: '/victoriametrics/active-queries', label: 'Active Queries', icon: Zap },
    { to: '/victoriametrics/alerts', label: 'Alert Rules', icon: Bell, section: 'ALERTING' },
  ];
  if (conn.alertmanagerUrl) {
    links.push({ to: '/victoriametrics/alertmanager', label: 'Alertmanager', icon: BellOff });
  }
  links.push(
    { to: '/victoriametrics/tsdb', label: 'TSDB Status', icon: HardDrive, section: 'STORAGE' },
    { to: '/victoriametrics/snapshots', label: 'Snapshots', icon: Camera },
    { to: '/victoriametrics/export-import', label: 'Export / Import', icon: ArrowDownUp },
    { to: '/victoriametrics/config', label: 'Config', icon: FileCode, section: 'ADMIN' },
    { to: '/victoriametrics/admin', label: 'Admin Operations', icon: Shield },
  );
  return links;
}

function getNavLinks(conn: SavedConnection | null): NavItem[] {
  if (!conn) return [];
  if (conn.type === 'victoriametrics') return getVmNavLinks(conn);
  if (conn.type === 'prometheus') {
    const links = [...prometheusNavLinks];
    if (conn.alertmanagerUrl) {
      links.splice(3, 0, prometheusAMLink);
    }
    return links;
  }
  return influxNavLinks;
}

function getBackendLabel(type: string): string {
  if (type === 'victoriametrics') return 'VictoriaMetrics';
  if (type === 'prometheus') return 'Prometheus';
  return 'InfluxDB';
}

function getFirstPage(type: string): string {
  if (type === 'victoriametrics') return '/victoriametrics/query';
  if (type === 'prometheus') return '/prometheus/query';
  return '/influxdb/query';
}

export default function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [activeConnection, setActiveConnection] = useState<SavedConnection | null>(null);

  const [standaloneMode, setStandaloneMode] = useState(false);
  const [defaultUrl, setDefaultUrl] = useState<string | undefined>(undefined);
  const [modeChecked, setModeChecked] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(basePath + '/api/mode');
        if (res.ok) {
          const data = await res.json();
          if (data.mode === 'standalone') {
            setStandaloneMode(true);
            client.setStandaloneMode(true);
            if (data.defaultUrl) setDefaultUrl(data.defaultUrl);
          }
        }
      } catch {
        // Not standalone
      }
      setModeChecked(true);
    })();
  }, []);

  const doPing = useCallback(async () => {
    if (!activeConnection) {
      setConnected(false);
      setVersion(null);
      return;
    }
    if (activeConnection.type === 'influxdb') {
      try {
        const response = await client.ping();
        setVersion(response.version);
        setConnected(response.ok);
      } catch {
        setConnected(false);
      }
    } else if (activeConnection.type === 'victoriametrics') {
      try {
        const url = `${basePath}/proxy/victoriametrics/?target=${encodeURIComponent(activeConnection.url)}&path=/api/v1/status/buildinfo`;
        const res = await fetch(url, {
          headers: activeConnection.username ? {
            'X-Proxy-Username': activeConnection.username,
            'X-Proxy-Password': activeConnection.password || '',
          } : {},
        });
        if (res.ok) {
          const data = await res.json();
          setVersion(data.data?.version || 'unknown');
          setConnected(data.status === 'success');
        } else {
          setConnected(false);
        }
      } catch {
        setConnected(false);
      }
    } else {
      try {
        const url = `${basePath}/proxy/prometheus/?target=${encodeURIComponent(activeConnection.url)}&path=/api/v1/status/buildinfo`;
        const res = await fetch(url, {
          headers: activeConnection.username ? {
            'X-Proxy-Username': activeConnection.username,
            'X-Proxy-Password': activeConnection.password || '',
          } : {},
        });
        if (res.ok) {
          const data = await res.json();
          setVersion(data.data?.version || 'unknown');
          setConnected(data.status === 'success');
        } else {
          setConnected(false);
        }
      } catch {
        setConnected(false);
      }
    }
  }, [activeConnection]);

  useEffect(() => {
    if (!modeChecked) return;
    doPing();
    const interval = setInterval(doPing, 10000);
    return () => clearInterval(interval);
  }, [modeChecked, doPing]);

  const handleConnectionChange = useCallback((conn: SavedConnection | null) => {
    setActiveConnection(conn);
    window.dispatchEvent(new CustomEvent('tidedb-connection-change', { detail: conn }));

    if (conn) {
      const currentPath = location.pathname;
      const connPrefix = conn.type === 'influxdb' ? '/influxdb' : conn.type === 'victoriametrics' ? '/victoriametrics' : '/prometheus';

      const isOnWrongBackend = !currentPath.startsWith(connPrefix) && currentPath !== '/';

      if (isOnWrongBackend || currentPath === '/' || currentPath === '') {
        navigate(getFirstPage(conn.type));
      }
    }
  }, [navigate, location.pathname]);

  const navLinks = getNavLinks(activeConnection);

  let lastSection = '';

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="px-5 py-5 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-blue-600 flex items-center justify-center flex-shrink-0">
            <Activity size={15} className="text-white" />
          </div>
          <div>
            <span className="text-white font-semibold text-base leading-tight block">TimeseriesUI</span>
            {version && version !== 'unknown' && (
              <span className="text-gray-500 text-xs leading-tight block">v{version}</span>
            )}
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {activeConnection && (
          <div className="px-3 mb-3">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
              {getBackendLabel(activeConnection.type)}
            </span>
          </div>
        )}
        {navLinks.map(({ to, label, icon: Icon, section }) => {
          const showSection = section && section !== lastSection;
          if (showSection) lastSection = section!;
          return (
            <React.Fragment key={to}>
              {showSection && (
                <div className="px-3 pt-3 pb-1">
                  <span className="text-[9px] font-semibold text-gray-600 uppercase tracking-widest">{section}</span>
                </div>
              )}
              <NavLink
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
            </React.Fragment>
          );
        })}
        {!activeConnection && (
          <div className="px-3 py-8 text-center">
            <p className="text-gray-500 text-xs">Add a connection below to get started</p>
          </div>
        )}
      </nav>

      <div className="border-t border-gray-800 px-3 py-4 space-y-3">
        {standaloneMode && (
          <ConnectionManager
            onConnectionChange={handleConnectionChange}
            defaultUrl={defaultUrl}
          />
        )}

        <div className="flex items-center gap-2 px-3 py-2">
          <Circle
            size={8}
            className={connected ? 'fill-green-500 text-green-500' : 'fill-red-500 text-red-500'}
          />
          <span className="text-xs text-gray-400">
            {connected ? 'Connected' : activeConnection ? 'Disconnected' : 'No connection'}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={[
          'fixed inset-y-0 left-0 z-30 w-60 bg-gray-900 flex flex-col transition-transform duration-200 ease-in-out',
          'lg:static lg:translate-x-0 lg:flex-shrink-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        {sidebarContent}
      </aside>

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-gray-900 border-b border-gray-800 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <span className="text-white font-semibold text-sm">TimeseriesUI</span>
        </header>

        <main className="flex-1 overflow-auto bg-gray-950">
          {children}
        </main>
      </div>
    </div>
  );
}
