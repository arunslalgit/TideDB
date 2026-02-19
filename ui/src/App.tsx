import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import QueryExplorer from './pages/QueryExplorer';
import DatabaseAdmin from './pages/DatabaseAdmin';
import WriteData from './pages/WriteData';
import SystemHealth from './pages/SystemHealth';
import PromQueryExplorer from './pages/prometheus/PromQueryExplorer';
import PromTargets from './pages/prometheus/PromTargets';
import PromAlertRules from './pages/prometheus/PromAlertRules';
import PromAlertmanager from './pages/prometheus/PromAlertmanager';
import PromTSDB from './pages/prometheus/PromTSDB';
import PromMetrics from './pages/prometheus/PromMetrics';
import PromConfig from './pages/prometheus/PromConfig';
import PromServiceDiscovery from './pages/prometheus/PromServiceDiscovery';

export default function App() {
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
      </Routes>
    </Layout>
  );
}
