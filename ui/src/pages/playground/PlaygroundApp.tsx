import { Routes, Route, Navigate } from 'react-router-dom';
import { PlaygroundProvider } from '../../api/playground/PlaygroundContext';
import PlaygroundLayout from './PlaygroundLayout';
import PlaygroundInfluxQuery from './PlaygroundInfluxQuery';
import PlaygroundPromQuery from './PlaygroundPromQuery';
import {
  PlaygroundInfluxAdmin,
  PlaygroundInfluxWrite,
  PlaygroundInfluxHealth,
  PlaygroundTargets,
  PlaygroundAlertRules,
  PlaygroundTsdbStatus,
  PlaygroundMetrics,
  PlaygroundConfig,
  PlaygroundServiceDiscovery,
  PlaygroundAlertmanager,
  PlaygroundVmActiveQueries,
  PlaygroundVmSnapshots,
  PlaygroundVmExportImport,
  PlaygroundVmAdmin,
} from './PlaygroundStaticPages';

export default function PlaygroundApp() {
  return (
    <PlaygroundProvider>
      <PlaygroundLayout>
        <Routes>
          <Route path="/" element={<Navigate to="/influxdb/query" replace />} />

          {/* InfluxDB */}
          <Route path="/influxdb/query" element={<PlaygroundInfluxQuery />} />
          <Route path="/influxdb/admin" element={<PlaygroundInfluxAdmin />} />
          <Route path="/influxdb/write" element={<PlaygroundInfluxWrite />} />
          <Route path="/influxdb/health" element={<PlaygroundInfluxHealth />} />

          {/* Prometheus */}
          <Route path="/prometheus/query" element={<PlaygroundPromQuery />} />
          <Route path="/prometheus/targets" element={<PlaygroundTargets />} />
          <Route path="/prometheus/alerts" element={<PlaygroundAlertRules />} />
          <Route path="/prometheus/alertmanager" element={<PlaygroundAlertmanager />} />
          <Route path="/prometheus/tsdb" element={<PlaygroundTsdbStatus />} />
          <Route path="/prometheus/metrics" element={<PlaygroundMetrics />} />
          <Route path="/prometheus/config" element={<PlaygroundConfig />} />
          <Route path="/prometheus/service-discovery" element={<PlaygroundServiceDiscovery />} />

          {/* VictoriaMetrics */}
          <Route path="/victoriametrics/query" element={<PlaygroundPromQuery />} />
          <Route path="/victoriametrics/targets" element={<PlaygroundTargets />} />
          <Route path="/victoriametrics/alerts" element={<PlaygroundAlertRules />} />
          <Route path="/victoriametrics/alertmanager" element={<PlaygroundAlertmanager />} />
          <Route path="/victoriametrics/metrics" element={<PlaygroundMetrics />} />
          <Route path="/victoriametrics/config" element={<PlaygroundConfig />} />
          <Route path="/victoriametrics/tsdb" element={<PlaygroundTsdbStatus />} />
          <Route path="/victoriametrics/active-queries" element={<PlaygroundVmActiveQueries />} />
          <Route path="/victoriametrics/snapshots" element={<PlaygroundVmSnapshots />} />
          <Route path="/victoriametrics/export-import" element={<PlaygroundVmExportImport />} />
          <Route path="/victoriametrics/admin" element={<PlaygroundVmAdmin />} />
        </Routes>
      </PlaygroundLayout>
    </PlaygroundProvider>
  );
}
