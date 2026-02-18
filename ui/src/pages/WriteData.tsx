import React, { useState, useEffect, useRef, useCallback } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { Upload, Trash2, Send, CheckCircle, XCircle, FileSpreadsheet, ArrowRight } from 'lucide-react';
import { client } from '../api/client';

// ── Constants ──────────────────────────────────────────────────────────────────

const PRECISION_OPTIONS = [
  { value: 'ns', label: 'ns — Nanoseconds' },
  { value: 'us', label: 'us — Microseconds' },
  { value: 'ms', label: 'ms — Milliseconds' },
  { value: 's',  label: 's  — Seconds' },
];

const EDITOR_PLACEHOLDER =
  'Enter line protocol data here...\ncpu,host=server01 usage_idle=98.2 1622505600000000000';

// ── Helpers ────────────────────────────────────────────────────────────────────

function countPoints(data: string): number {
  return data
    .split('\n')
    .filter((line) => line.trim().length > 0 && !line.trim().startsWith('#'))
    .length;
}

// ── Status types ───────────────────────────────────────────────────────────────

type StatusState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; points: number }
  | { kind: 'error'; message: string };

// ── CSV Import Helpers ──────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { result.push(current); current = ''; }
      else { current += ch; }
    }
  }
  result.push(current);
  return result;
}

function csvToLineProtocol(
  csvText: string,
  measurement: string,
  tagColumns: Set<string>,
  timestampColumn: string,
): string {
  const lines = csvText.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 2) return '';
  const headers = parseCSVLine(lines[0]).map((h) => h.trim());
  const result: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length !== headers.length) continue;

    let tags = '';
    const fields: string[] = [];
    let timestamp = '';

    headers.forEach((header, idx) => {
      const val = values[idx]?.trim() ?? '';
      if (!val) return;
      if (header === timestampColumn) {
        // Try parsing as number or date
        const num = Number(val);
        if (!isNaN(num)) { timestamp = String(num); }
        else {
          const d = new Date(val);
          if (!isNaN(d.getTime())) { timestamp = String(d.getTime() * 1000000); }
        }
      } else if (tagColumns.has(header)) {
        // Escape tag values
        const escaped = val.replace(/ /g, '\\ ').replace(/,/g, '\\,').replace(/=/g, '\\=');
        tags += `,${header}=${escaped}`;
      } else {
        // Field value — try to detect type
        const num = Number(val);
        if (!isNaN(num) && val !== '') { fields.push(`${header}=${val}`); }
        else if (val === 'true' || val === 'false' || val === 'TRUE' || val === 'FALSE') { fields.push(`${header}=${val.toLowerCase()}`); }
        else { fields.push(`${header}="${val.replace(/"/g, '\\"')}"`); }
      }
    });

    if (fields.length === 0) continue;
    let line = measurement + tags + ' ' + fields.join(',');
    if (timestamp) line += ' ' + timestamp;
    result.push(line);
  }

  return result.join('\n');
}

// ── CSV Import Panel ────────────────────────────────────────────────────────

interface CSVImportPanelProps {
  onConvert: (lineProtocol: string) => void;
}

function CSVImportPanel({ onConvert }: CSVImportPanelProps) {
  const [csvText, setCsvText] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [measurement, setMeasurement] = useState('');
  const [tagColumns, setTagColumns] = useState<Set<string>>(new Set());
  const [timestampColumn, setTimestampColumn] = useState('');
  const [preview, setPreview] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const parseHeaders = useCallback((text: string) => {
    const firstLine = text.split('\n')[0] ?? '';
    const parsed = parseCSVLine(firstLine).map((h) => h.trim()).filter(Boolean);
    setHeaders(parsed);
    // Auto-detect timestamp column
    const tsCol = parsed.find((h) => /^(time|timestamp|date|datetime)$/i.test(h));
    if (tsCol) setTimestampColumn(tsCol);
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text === 'string') { setCsvText(text); parseHeaders(text); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const toggleTagColumn = (col: string) => {
    setTagColumns((prev) => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col); else next.add(col);
      return next;
    });
  };

  const handlePreview = () => {
    if (!measurement.trim() || !csvText) return;
    const lp = csvToLineProtocol(csvText, measurement.trim(), tagColumns, timestampColumn);
    setPreview(lp);
  };

  const handleConvert = () => {
    if (!measurement.trim() || !csvText) return;
    const lp = csvToLineProtocol(csvText, measurement.trim(), tagColumns, timestampColumn);
    onConvert(lp);
  };

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 mt-6">
      <h3 className="text-sm font-semibold text-gray-200 mb-3 flex items-center gap-2">
        <FileSpreadsheet className="w-4 h-4 text-blue-400" />
        CSV Import
      </h3>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-gray-200 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-150">
            <Upload className="w-4 h-4" /> Upload CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
          {csvText && <span className="text-xs text-gray-400">{csvText.split('\n').length - 1} rows detected</span>}
        </div>

        {headers.length > 0 && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Measurement Name</label>
              <input type="text" value={measurement} onChange={(e) => setMeasurement(e.target.value)} placeholder="my_measurement"
                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors duration-150 max-w-xs" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Timestamp Column</label>
              <select value={timestampColumn} onChange={(e) => setTimestampColumn(e.target.value)}
                className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 transition-colors duration-150 max-w-xs">
                <option value="">(none — auto timestamp)</option>
                {headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">Tag Columns <span className="text-gray-500">(click to toggle, unselected = field)</span></label>
              <div className="flex flex-wrap gap-2">
                {headers.filter((h) => h !== timestampColumn).map((h) => (
                  <button key={h} onClick={() => toggleTagColumn(h)}
                    className={`px-2.5 py-1 text-xs rounded-md border transition-colors duration-150 font-mono ${
                      tagColumns.has(h) ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                    }`}>
                    {h}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={handlePreview} disabled={!measurement.trim()}
                className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-200 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-150">
                Preview
              </button>
              <button onClick={handleConvert} disabled={!measurement.trim()}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-2 rounded-md text-sm font-medium transition-colors duration-150">
                <ArrowRight className="w-4 h-4" /> Convert to Line Protocol
              </button>
            </div>

            {preview && (
              <div className="bg-gray-900 rounded-md border border-gray-700 p-3 max-h-48 overflow-y-auto">
                <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap">{preview.split('\n').slice(0, 20).join('\n')}{preview.split('\n').length > 20 ? `\n... (${preview.split('\n').length - 20} more lines)` : ''}</pre>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function WriteData() {
  const [databases, setDatabases] = useState<string[]>([]);
  const [selectedDb, setSelectedDb] = useState<string>('');
  const [retentionPolicies, setRetentionPolicies] = useState<any[]>([]);
  const [selectedRp, setSelectedRp] = useState<string>('');
  const [precision, setPrecision] = useState<string>('ns');
  const [editorContent, setEditorContent] = useState<string>('');
  const [status, setStatus] = useState<StatusState>({ kind: 'idle' });
  const [loading, setLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load databases on mount
  useEffect(() => {
    client
      .getDatabases()
      .then((dbs) => {
        setDatabases(dbs);
        if (dbs.length > 0) {
          setSelectedDb(dbs[0]);
        }
      })
      .catch(() => {});
  }, []);

  // Load retention policies when db changes
  useEffect(() => {
    if (!selectedDb) {
      setRetentionPolicies([]);
      setSelectedRp('');
      return;
    }
    client
      .getRetentionPolicies(selectedDb)
      .then((rps) => {
        setRetentionPolicies(rps);
        const def = rps.find((r) => r.default);
        setSelectedRp(def?.name ?? rps[0]?.name ?? '');
      })
      .catch(() => {
        setRetentionPolicies([]);
        setSelectedRp('');
      });
  }, [selectedDb]);

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const handleWrite = async () => {
    const data = editorContent.trim();
    if (!selectedDb || !data) return;

    setLoading(true);
    setStatus({ kind: 'loading' });

    try {
      await client.write(selectedDb, data, precision, selectedRp || undefined);
      const points = countPoints(data);
      setStatus({ kind: 'success', points });
    } catch (err: any) {
      setStatus({ kind: 'error', message: err?.message ?? 'Unknown error' });
    } finally {
      setLoading(false);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text === 'string') {
        setEditorContent(text);
        setStatus({ kind: 'idle' });
      }
    };
    reader.readAsText(file);

    // Reset so the same file can be re-selected
    e.target.value = '';
  };

  const handleClear = () => {
    setEditorContent('');
    setStatus({ kind: 'idle' });
  };

  const canWrite = Boolean(selectedDb) && editorContent.trim().length > 0;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-gray-950 text-gray-100 overflow-y-auto">
      {/* Page header */}
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-900 border-b border-gray-700 flex-shrink-0">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Write Data
        </span>
      </div>

      {/* Card wrapper */}
      <div className="flex-1 p-6">
        <div className="max-w-4xl mx-auto bg-gray-800 rounded-lg border border-gray-700 p-6 flex flex-col gap-6">

          {/* Controls row */}
          <div className="flex flex-wrap items-end gap-4">
            {/* Database */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-400">Database</label>
              <select
                value={selectedDb}
                onChange={(e) => {
                  setSelectedDb(e.target.value);
                  setStatus({ kind: 'idle' });
                }}
                className="bg-gray-700 border border-gray-600 text-gray-100 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors duration-150 min-w-[160px]"
              >
                <option value="">— select database —</option>
                {databases.map((db) => (
                  <option key={db} value={db}>
                    {db}
                  </option>
                ))}
              </select>
            </div>

            {/* Retention Policy */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-400">Retention Policy</label>
              <select
                value={selectedRp}
                onChange={(e) => setSelectedRp(e.target.value)}
                disabled={retentionPolicies.length === 0}
                className="bg-gray-700 border border-gray-600 text-gray-100 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors duration-150 min-w-[160px] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">— default —</option>
                {retentionPolicies.map((rp) => (
                  <option key={rp.name} value={rp.name}>
                    {rp.name}
                    {rp.default ? ' (default)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Precision */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-400">Precision</label>
              <select
                value={precision}
                onChange={(e) => setPrecision(e.target.value)}
                className="bg-gray-700 border border-gray-600 text-gray-100 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors duration-150 min-w-[180px]"
              >
                {PRECISION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Editor section */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-400">Line Protocol Data</label>
              <span className="text-xs text-gray-500">
                {countPoints(editorContent)} line{countPoints(editorContent) !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="rounded-md overflow-hidden border border-gray-600">
              <CodeMirror
                value={editorContent}
                onChange={(val) => {
                  setEditorContent(val);
                  if (status.kind === 'success' || status.kind === 'error') {
                    setStatus({ kind: 'idle' });
                  }
                }}
                placeholder={EDITOR_PLACEHOLDER}
                theme="dark"
                height="300px"
                style={{
                  height: '300px',
                  fontSize: '13px',
                  backgroundColor: '#1f2937',
                }}
                basicSetup={{
                  lineNumbers: true,
                  highlightActiveLineGutter: true,
                  highlightActiveLine: true,
                  bracketMatching: false,
                  autocompletion: false,
                  indentOnInput: false,
                }}
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Write Data */}
            <button
              onClick={handleWrite}
              disabled={!canWrite || loading}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-900 disabled:text-blue-400 disabled:cursor-not-allowed text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-150"
            >
              <Send className="w-4 h-4" />
              Write Data
            </button>

            {/* Upload File */}
            <button
              onClick={handleUploadClick}
              disabled={loading}
              className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-gray-200 px-4 py-2 rounded-md text-sm font-medium transition-colors duration-150"
            >
              <Upload className="w-4 h-4" />
              Upload File
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.lp"
              className="hidden"
              onChange={handleFileChange}
            />

            {/* Clear */}
            <button
              onClick={handleClear}
              disabled={loading}
              className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-gray-200 px-4 py-2 rounded-md text-sm font-medium transition-colors duration-150"
            >
              <Trash2 className="w-4 h-4" />
              Clear
            </button>
          </div>

          {/* Status message */}
          {status.kind !== 'idle' && (
            <div
              className="flex items-start gap-3 rounded-md px-4 py-3 text-sm border"
              style={
                status.kind === 'loading'
                  ? { backgroundColor: 'rgba(55,65,81,0.5)', borderColor: '#4b5563', color: '#d1d5db' }
                  : status.kind === 'success'
                  ? { backgroundColor: 'rgba(5,46,22,0.6)', borderColor: '#15803d', color: '#86efac' }
                  : { backgroundColor: 'rgba(69,10,10,0.6)', borderColor: '#b91c1c', color: '#fca5a5' }
              }
            >
              {status.kind === 'loading' && (
                <>
                  <svg
                    className="w-5 h-5 animate-spin flex-shrink-0 mt-0.5"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    />
                  </svg>
                  <span>Writing data...</span>
                </>
              )}

              {status.kind === 'success' && (
                <>
                  <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <span>
                    {status.points} point{status.points !== 1 ? 's' : ''} written successfully
                  </span>
                </>
              )}

              {status.kind === 'error' && (
                <>
                  <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <span className="break-all font-mono text-xs">{status.message}</span>
                </>
              )}
            </div>
          )}

          {/* CSV Import Panel */}
          <CSVImportPanel onConvert={(lp) => { setEditorContent(lp); setStatus({ kind: 'idle' }); }} />
        </div>
      </div>
    </div>
  );
}
