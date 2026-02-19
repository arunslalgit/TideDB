import { useState } from 'react';
import { Download, Upload, FileText } from 'lucide-react';
import { useActiveConnection } from '../../hooks/useActiveConnection';
import { exportData, importData } from '../../api/victoriametrics';

type ExportFormat = 'json' | 'csv' | 'native';
type ImportFormat = 'json' | 'csv' | 'native' | 'prometheus';

export default function VmExportImport() {
  const { connection, auth } = useActiveConnection();
  const [tab, setTab] = useState<'export' | 'import'>('export');

  // Export state — default to last 1 hour to avoid overwhelming large instances
  const [exportMatch, setExportMatch] = useState('');
  const [exportStart, setExportStart] = useState(() => {
    const d = new Date(Date.now() - 3600_000);
    return d.toISOString().replace(/\.\d+Z$/, 'Z');
  });
  const [exportEnd, setExportEnd] = useState(() => {
    return new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  });
  const [exportFormat, setExportFormat] = useState<ExportFormat>('json');
  const [csvFormatStr, setCsvFormatStr] = useState('__name__,__value__,__timestamp__:unix_s');
  const [exportPreview, setExportPreview] = useState('');
  const [exporting, setExporting] = useState(false);

  // Import state
  const [importFormat, setImportFormat] = useState<ImportFormat>('prometheus');
  const [importText, setImportText] = useState('');
  const [importCsvFormat, setImportCsvFormat] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  const handlePreview = async () => {
    if (!connection || !exportMatch.trim()) {
      setError('Match selector is required. Example: {__name__="up"} or {job="node"}');
      return;
    }
    setExporting(true);
    setError(null);
    try {
      const data = await exportData(
        connection.url,
        { match: exportMatch, start: exportStart || undefined, end: exportEnd || undefined, format: exportFormat, csvFormat: exportFormat === 'csv' ? csvFormatStr : undefined },
        auth,
      );
      // Limit preview
      const lines = data.split('\n').slice(0, 100);
      setExportPreview(lines.join('\n'));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  };

  const handleDownload = async () => {
    if (!connection || !exportMatch.trim()) {
      setError('Match selector is required. Example: {__name__="up"} or {job="node"}');
      return;
    }
    setExporting(true);
    setError(null);
    try {
      const data = await exportData(
        connection.url,
        { match: exportMatch, start: exportStart || undefined, end: exportEnd || undefined, format: exportFormat, csvFormat: exportFormat === 'csv' ? csvFormatStr : undefined },
        auth,
      );
      const ext = exportFormat === 'csv' ? 'csv' : exportFormat === 'native' ? 'bin' : 'jsonl';
      const blob = new Blob([data], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `export.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async () => {
    if (!connection || !importText.trim()) return;
    setImporting(true);
    setError(null);
    setImportResult(null);
    try {
      await importData(
        connection.url,
        { format: importFormat, body: importText, csvFormat: importFormat === 'csv' ? importCsvFormat : undefined },
        auth,
      );
      setImportResult('Data imported successfully');
      setImportText('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setImporting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImportText(reader.result as string);
    reader.readAsText(file);
  };

  if (!connection || connection.type !== 'victoriametrics') {
    return <div className="flex items-center justify-center h-full text-gray-500"><p>Select a VictoriaMetrics connection.</p></div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <h1 className="text-lg font-semibold text-white">Export / Import</h1>

      <div className="flex gap-1">
        <button
          onClick={() => setTab('export')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-t text-sm font-medium transition-colors ${
            tab === 'export' ? 'bg-gray-800 text-white border border-gray-700 border-b-gray-800' : 'text-gray-400 hover:text-white'
          }`}
        >
          <Download size={14} /> Export
        </button>
        <button
          onClick={() => setTab('import')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-t text-sm font-medium transition-colors ${
            tab === 'import' ? 'bg-gray-800 text-white border border-gray-700 border-b-gray-800' : 'text-gray-400 hover:text-white'
          }`}
        >
          <Upload size={14} /> Import
        </button>
      </div>

      {error && (
        <div className="p-3 rounded bg-red-900/30 border border-red-800 text-red-300 text-sm">
          {error}
          {(error.includes('matching timeseries exceeds') || error.includes('search.max')) && (
            <p className="mt-1 text-xs text-red-400">
              Too many matching series. Narrow the match selector and/or reduce the time range.
            </p>
          )}
        </div>
      )}

      {tab === 'export' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-800 p-4 space-y-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Match Selector</label>
              <input
                type="text"
                value={exportMatch}
                onChange={(e) => setExportMatch(e.target.value)}
                placeholder='{__name__=~"up|node_cpu_seconds_total"}'
                className="w-full px-3 py-2 rounded bg-gray-800 border border-gray-700 text-gray-200 text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Start (optional, Unix ts or RFC3339)</label>
                <input
                  type="text"
                  value={exportStart}
                  onChange={(e) => setExportStart(e.target.value)}
                  placeholder="e.g. 2026-02-18T00:00:00Z"
                  className="w-full px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-200 text-xs placeholder-gray-600 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">End (optional)</label>
                <input
                  type="text"
                  value={exportEnd}
                  onChange={(e) => setExportEnd(e.target.value)}
                  placeholder="e.g. 2026-02-19T00:00:00Z"
                  className="w-full px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-200 text-xs placeholder-gray-600 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Format</label>
              <div className="flex gap-1">
                {(['json', 'csv', 'native'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setExportFormat(f)}
                    className={`px-3 py-1.5 rounded text-xs font-medium uppercase ${
                      exportFormat === f ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            {exportFormat === 'csv' && (
              <div>
                <label className="text-xs text-gray-500 block mb-1">CSV Format String</label>
                <input
                  type="text"
                  value={csvFormatStr}
                  onChange={(e) => setCsvFormatStr(e.target.value)}
                  className="w-full px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-200 text-xs font-mono placeholder-gray-600 focus:outline-none focus:border-blue-500"
                />
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={handlePreview}
                disabled={exporting || !exportMatch.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium transition-colors disabled:opacity-40"
              >
                <FileText size={12} />
                {exporting ? 'Loading...' : 'Preview (first 100 rows)'}
              </button>
              <button
                onClick={handleDownload}
                disabled={exporting || !exportMatch.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors disabled:opacity-40"
              >
                <Download size={12} />
                Download Export
              </button>
            </div>
          </div>
          {exportPreview && (
            <div className="rounded-lg border border-gray-800 overflow-hidden">
              <div className="px-4 py-2 bg-gray-900 border-b border-gray-800 text-xs text-gray-400">Preview</div>
              <pre className="p-4 text-xs text-gray-300 font-mono overflow-auto max-h-80 whitespace-pre-wrap">{exportPreview}</pre>
            </div>
          )}
        </div>
      )}

      {tab === 'import' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-800 p-4 space-y-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Format</label>
              <div className="flex gap-1">
                {(['prometheus', 'json', 'csv', 'native'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setImportFormat(f)}
                    className={`px-3 py-1.5 rounded text-xs font-medium capitalize ${
                      importFormat === f ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                    }`}
                  >
                    {f === 'prometheus' ? 'Prometheus Text' : f.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            {importFormat === 'csv' && (
              <div>
                <label className="text-xs text-gray-500 block mb-1">CSV Format String</label>
                <input
                  type="text"
                  value={importCsvFormat}
                  onChange={(e) => setImportCsvFormat(e.target.value)}
                  placeholder="e.g. 2:metric:cpu,3:label:host,4:time:unix_s"
                  className="w-full px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-200 text-xs font-mono placeholder-gray-600 focus:outline-none focus:border-blue-500"
                />
              </div>
            )}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Choose a file or paste data below</label>
              <input type="file" onChange={handleFileUpload} className="block text-xs text-gray-400 mb-2" />
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={8}
                placeholder={importFormat === 'prometheus' ? 'metric_name{label="value"} 123 1700000000000' : 'Paste data here...'}
                className="w-full px-3 py-2 rounded bg-gray-800 border border-gray-700 text-gray-200 text-xs font-mono placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>
            <button
              onClick={handleImport}
              disabled={importing || !importText.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors disabled:opacity-40"
            >
              <Upload size={12} />
              {importing ? 'Importing...' : 'Import Data'}
            </button>
          </div>
          {importResult && (
            <div className="p-3 rounded bg-green-900/20 border border-green-800/50 text-green-300 text-sm">{importResult}</div>
          )}
        </div>
      )}
    </div>
  );
}
