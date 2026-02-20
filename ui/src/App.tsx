import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import { isPlaygroundMode } from './config';
import PlaygroundApp from './pages/playground/PlaygroundApp';

// InfluxDB pages
import QueryExplorer from './pages/influxdb/QueryExplorer';
import DatabaseAdmin from './pages/influxdb/DatabaseAdmin';
import WriteData from './pages/influxdb/WriteData';
import SystemHealth from './pages/influxdb/SystemHealth';

// Prometheus pages (also reused by VictoriaMetrics)
import PromQueryExplorer from './pages/prometheus/PromQueryExplorer';
import PromTargets from './pages/prometheus/PromTargets';
import PromAlertRules from './pages/prometheus/PromAlertRules';
import PromAlertmanager from './pages/prometheus/PromAlertmanager';
import PromTSDB from './pages/prometheus/PromTSDB';
import PromMetrics from './pages/prometheus/PromMetrics';
import PromConfig from './pages/prometheus/PromConfig';
import PromServiceDiscovery from './pages/prometheus/PromServiceDiscovery';

// VictoriaMetrics exclusive pages
import VmActiveQueries from './pages/victoriametrics/VmActiveQueries';
import VmTSDB from './pages/victoriametrics/VmTSDB';
import VmSnapshots from './pages/victoriametrics/VmSnapshots';
import VmExportImport from './pages/victoriametrics/VmExportImport';
import VmAdmin from './pages/victoriametrics/VmAdmin';

export default function App() {
  // When the URL starts with /playground, the BrowserRouter basename is set to
  // /playground and PlaygroundApp handles all routes with mock data.
  if (isPlaygroundMode) {
    return <PlaygroundApp />;
  }

  // Normal mode — real DB connections
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/influxdb/query" replace />} />

        {/* Legacy routes redirect to new paths */}
        <Route path="/explore" element={<Navigate to="/influxdb/query" replace />} />
        <Route path="/admin" element={<Navigate to="/influxdb/admin" replace />} />
        <Route path="/write" element={<Navigate to="/influxdb/write" replace />} />
        <Route path="/health" element={<Navigate to="/influxdb/health" replace />} />

        {/* InfluxDB pages */}
        <Route path="/influxdb/query" element={<QueryExplorer />} />
        <Route path="/influxdb/admin" element={<DatabaseAdmin />} />
        <Route path="/influxdb/write" element={<WriteData />} />
        <Route path="/influxdb/health" element={<SystemHealth />} />

        {/* Prometheus pages */}
        <Route path="/prometheus/query" element={<PromQueryExplorer />} />
        <Route path="/prometheus/targets" element={<PromTargets />} />
        <Route path="/prometheus/alerts" element={<PromAlertRules />} />
        <Route path="/prometheus/alertmanager" element={<PromAlertmanager />} />
        <Route path="/prometheus/tsdb" element={<PromTSDB />} />
        <Route path="/prometheus/metrics" element={<PromMetrics />} />
        <Route path="/prometheus/config" element={<PromConfig />} />
        <Route path="/prometheus/service-discovery" element={<PromServiceDiscovery />} />

        {/* VictoriaMetrics pages — reused Prometheus components */}
        <Route path="/victoriametrics/query" element={<PromQueryExplorer />} />
        <Route path="/victoriametrics/targets" element={<PromTargets />} />
        <Route path="/victoriametrics/alerts" element={<PromAlertRules />} />
        <Route path="/victoriametrics/alertmanager" element={<PromAlertmanager />} />
        <Route path="/victoriametrics/metrics" element={<PromMetrics />} />
        <Route path="/victoriametrics/config" element={<PromConfig />} />
        <Route path="/victoriametrics/service-discovery" element={<PromServiceDiscovery />} />

        {/* VictoriaMetrics exclusive pages */}
        <Route path="/victoriametrics/tsdb" element={<VmTSDB />} />
        <Route path="/victoriametrics/active-queries" element={<VmActiveQueries />} />
        <Route path="/victoriametrics/snapshots" element={<VmSnapshots />} />
        <Route path="/victoriametrics/export-import" element={<VmExportImport />} />
        <Route path="/victoriametrics/admin" element={<VmAdmin />} />
      </Routes>
    </Layout>
  );
}
