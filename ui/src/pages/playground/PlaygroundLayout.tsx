import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Terminal, Database, PenLine, Activity, Menu, X,
  Crosshair, Bell, HardDrive, LayoutList, FileCode,
  Zap, ArrowDownUp, Camera, Shield, Flame, Hexagon,
  FlaskConical,
} from 'lucide-react';
import { usePlayground } from '../../api/playground/PlaygroundContext';
import type { BackendType } from '../../components/ConnectionManager';
import PlaygroundBanner from '../../components/PlaygroundBanner';

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
];

const vmNavLinks: NavItem[] = [
  { to: '/victoriametrics/query', label: 'Query Explorer', icon: Terminal, section: 'QUERY' },
  { to: '/victoriametrics/metrics', label: 'Metrics Explorer', icon: LayoutList },
  { to: '/victoriametrics/targets', label: 'Targets', icon: Crosshair, section: 'MONITORING' },
  { to: '/victoriametrics/active-queries', label: 'Active Queries', icon: Zap },
  { to: '/victoriametrics/alerts', label: 'Alert Rules', icon: Bell, section: 'ALERTING' },
  { to: '/victoriametrics/tsdb', label: 'TSDB Status', icon: HardDrive, section: 'STORAGE' },
  { to: '/victoriametrics/snapshots', label: 'Snapshots', icon: Camera },
  { to: '/victoriametrics/export-import', label: 'Export / Import', icon: ArrowDownUp },
  { to: '/victoriametrics/config', label: 'Config', icon: FileCode, section: 'ADMIN' },
  { to: '/victoriametrics/admin', label: 'Admin Operations', icon: Shield },
];

function getNavLinks(type: BackendType): NavItem[] {
  if (type === 'victoriametrics') return vmNavLinks;
  if (type === 'prometheus') return prometheusNavLinks;
  return influxNavLinks;
}

function getBackendLabel(type: BackendType): string {
  if (type === 'victoriametrics') return 'VictoriaMetrics';
  if (type === 'prometheus') return 'Prometheus';
  return 'InfluxDB';
}

function getFirstPage(type: BackendType): string {
  if (type === 'victoriametrics') return '/victoriametrics/query';
  if (type === 'prometheus') return '/prometheus/query';
  return '/influxdb/query';
}

const backends: { type: BackendType; label: string; icon: React.ComponentType<{ size?: number; className?: string }>; color: string; activeColor: string }[] = [
  { type: 'influxdb', label: 'InfluxDB', icon: Database, color: 'text-blue-400', activeColor: 'bg-blue-600' },
  { type: 'prometheus', label: 'Prometheus', icon: Flame, color: 'text-orange-400', activeColor: 'bg-orange-600' },
  { type: 'victoriametrics', label: 'VM', icon: Hexagon, color: 'text-emerald-400', activeColor: 'bg-emerald-600' },
];

interface PlaygroundLayoutProps {
  children: React.ReactNode;
}

export default function PlaygroundLayout({ children }: PlaygroundLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { backendType, setBackendType } = usePlayground();
  const navigate = useNavigate();

  const navLinks = getNavLinks(backendType);
  let lastSection = '';

  const switchBackend = (type: BackendType) => {
    setBackendType(type);
    navigate(getFirstPage(type));
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="px-5 py-5 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-amber-600 flex items-center justify-center flex-shrink-0">
            <FlaskConical size={15} className="text-white" />
          </div>
          <div>
            <span className="text-white font-semibold text-base leading-tight block">Playground</span>
            <span className="text-gray-500 text-xs leading-tight block">Sample Data</span>
          </div>
        </div>
      </div>

      {/* Backend Switcher */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex gap-1">
          {backends.map((b) => (
            <button
              key={b.type}
              onClick={() => switchBackend(b.type)}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-xs font-medium transition-colors ${
                backendType === b.type
                  ? `${b.activeColor} text-white`
                  : 'bg-gray-800 text-gray-400 hover:text-white border border-gray-700'
              }`}
            >
              <b.icon size={10} />
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
        <div className="px-3 mb-3">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
            {getBackendLabel(backendType)}
          </span>
        </div>
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
                      ? 'bg-gray-800 text-white border-l-2 border-amber-500 pl-[10px]'
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
      </nav>

      <div className="border-t border-gray-800 px-3 py-3 space-y-2">
        <div className="flex items-center gap-2 px-3 py-1.5">
          <FlaskConical size={10} className="text-amber-500 flex-shrink-0" />
          <span className="text-xs text-gray-400">Playground Mode</span>
        </div>
        <p className="px-3 text-[10px] text-gray-600 leading-snug">
          Using generated sample data. Run the binary with your DB connection to use real data.
        </p>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white overflow-hidden">
      <PlaygroundBanner />
      <div className="flex flex-1 min-h-0 overflow-hidden">
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
            <span className="text-white font-semibold text-sm">Playground</span>
          </header>

          <main className="flex-1 overflow-auto bg-gray-950">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
