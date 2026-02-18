import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import QueryExplorer from './pages/QueryExplorer';
import DatabaseAdmin from './pages/DatabaseAdmin';
import WriteData from './pages/WriteData';
import SystemHealth from './pages/SystemHealth';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/explore" replace />} />
        <Route path="/explore" element={<QueryExplorer />} />
        <Route path="/admin" element={<DatabaseAdmin />} />
        <Route path="/write" element={<WriteData />} />
        <Route path="/health" element={<SystemHealth />} />
      </Routes>
    </Layout>
  );
}
