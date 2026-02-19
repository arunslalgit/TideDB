import React, { useState, useEffect, useCallback, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  ChevronRight,
  ChevronDown,
  Play,
  Clock,
  Table2,
  BarChart3,
  Search,
  Download,
  FileJson,
  Zap,
} from 'lucide-react';
import { client } from '../../api/client';

// ── Constants ──────────────────────────────────────────────────────────────────

const HISTORY_KEY = 'tidedb_query_history';
const LAST_DB_KEY = 'tidedb_last_db';
const MAX_HISTORY = 30;
const CHART_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#22c55e', '#06b6d4'];

const EPOCH_OPTIONS = [
  { value: '', label: 'Default' },
  { value: 'rfc3339', label: 'RFC3339' },
  { value: 'ns', label: 'ns' },
  { value: 'us', label: 'us' },
  { value: 'ms', label: 'ms' },
  { value: 's', label: 's' },
];

/** Convert an epoch or RFC3339 timestamp to a human-readable local string. */
function formatTimestampValue(val: any, epochUnit: string): string {
  if (val === null || val === undefined) return '';
  const s = String(val);
  // Already RFC3339 — parse directly
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val)) {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.toLocaleString();
    return s;
  }
  const num = Number(val);
  if (isNaN(num)) return s;
  let ms: number;
  switch (epochUnit) {
    case 'ns': ms = num / 1e6; break;
    case 'us': ms = num / 1e3; break;
    case 'ms': ms = num; break;
    case 's':  ms = num * 1000; break;
    default:   // Default epoch is nanoseconds for InfluxDB
      if (num > 1e15) ms = num / 1e6;       // likely nanoseconds
      else if (num > 1e12) ms = num / 1e3;  // likely microseconds
      else if (num > 1e10) ms = num;         // likely milliseconds
      else ms = num * 1000;                  // likely seconds
      break;
  }
  const d = new Date(ms);
  if (!isNaN(d.getTime())) return d.toLocaleString();
  return s;
}

const INFLUXQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'LIMIT', 'OFFSET',
  'INTO', 'SHOW', 'CREATE', 'DROP', 'ALTER', 'GRANT', 'REVOKE', 'SET',
  'AND', 'OR', 'AS', 'ON', 'BY', 'FILL', 'SLIMIT', 'SOFFSET',
  'WITH', 'KEY', 'IN', 'NOT', 'ASC', 'DESC', 'DISTINCT', 'MEAN',
  'SUM', 'COUNT', 'MIN', 'MAX', 'FIRST', 'LAST', 'STDDEV', 'MEDIAN',
  'PERCENTILE', 'DERIVATIVE', 'NON_NEGATIVE_DERIVATIVE', 'DIFFERENCE',
  'MOVING_AVERAGE', 'CUMULATIVE_SUM', 'HOLT_WINTERS', 'ELAPSED',
  'TIME', 'NOW', 'NULL', 'TRUE', 'FALSE',
];

const FIELD_TYPE_COLORS: Record<string, string> = {
  float: 'text-blue-400',
  integer: 'text-green-400',
  string: 'text-amber-400',
  boolean: 'text-purple-400',
};

// ── Types ──────────────────────────────────────────────────────────────────────

interface SchemaNode {
  type: 'database' | 'rp' | 'measurement' | 'fields-header' | 'tags-header' | 'field' | 'tag';
  name: string;
  dbName?: string;
  rpName?: string;
  measurementName?: string;
  fieldType?: string;
  children?: SchemaNode[];
  loaded?: boolean;
  expanded?: boolean;
}

interface FlatSchemaNode extends SchemaNode {
  depth: number;
  id: string;
}

interface TableRow {
  [col: string]: any;
}

interface ParsedSeries {
  name: string;
  tags: Record<string, string>;
  columns: string[];
  rows: TableRow[];
}

interface QueryResults {
  series: ParsedSeries[];
  duration: number;
  error?: string;
}

type SortDir = 'asc' | 'desc';

// ── Helpers ────────────────────────────────────────────────────────────────────

function loadHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveHistory(entries: string[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)));
  } catch {
    // ignore quota errors
  }
}

function pushHistory(entry: string): void {
  const history = loadHistory().filter((h) => h !== entry);
  history.unshift(entry);
  saveHistory(history);
}

function loadLastDb(): string {
  return localStorage.getItem(LAST_DB_KEY) || '';
}

function saveLastDb(db: string): void {
  try {
    localStorage.setItem(LAST_DB_KEY, db);
  } catch {
    // ignore
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatQuery(query: string): string {
  let formatted = query;
  // Uppercase known keywords (longest first to avoid partial matches)
  const sorted = [...INFLUXQL_KEYWORDS].sort((a, b) => b.length - a.length);
  for (const kw of sorted) {
    const escaped = kw.replace(/\s+/g, '\\s+');
    formatted = formatted.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), kw);
  }
  return formatted;
}

function parseQueryResults(rawResult: any): ParsedSeries[] {
  const series: ParsedSeries[] = [];
  for (const result of rawResult?.results ?? []) {
    if (result.error) continue;
    for (const s of result.series ?? []) {
      const rows: TableRow[] = (s.values ?? []).map((row: any[]) => {
        const obj: TableRow = {};
        s.columns.forEach((col: string, i: number) => {
          obj[col] = row[i];
        });
        return obj;
      });
      series.push({
        name: s.name,
        tags: s.tags ?? {},
        columns: s.columns,
        rows,
      });
    }
  }
  return series;
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportCSV(series: ParsedSeries[]) {
  const lines: string[] = [];
  for (const s of series) {
    if (series.length > 1) lines.push(`# ${s.name}${Object.keys(s.tags).length ? ' ' + JSON.stringify(s.tags) : ''}`);
    lines.push(s.columns.join(','));
    for (const row of s.rows) {
      lines.push(s.columns.map((col) => {
        const val = row[col];
        if (val === null || val === undefined) return '';
        const str = String(val);
        return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(','));
    }
    lines.push('');
  }
  downloadFile(lines.join('\n'), 'query_results.csv', 'text/csv');
}

function exportJSON(series: ParsedSeries[]) {
  const data = series.map((s) => ({
    name: s.name,
    tags: s.tags,
    columns: s.columns,
    values: s.rows,
  }));
  downloadFile(JSON.stringify(data, null, 2), 'query_results.json', 'application/json');
}

function buildTagLabel(tags: Record<string, string>): string {
  const pairs = Object.entries(tags);
  if (pairs.length === 0) return '';
  return '{' + pairs.map(([k, v]) => `${k}=${v}`).join(',') + '}';
}

// ── Schema Explorer ────────────────────────────────────────────────────────────

interface SchemaExplorerProps {
  onInsert: (text: string) => void;
}

function SchemaExplorer({ onInsert }: SchemaExplorerProps) {
  const [databases, setDatabases] = useState<string[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [loadedChildren, setLoadedChildren] = useState<Record<string, SchemaNode[]>>({});
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [tagValues, setTagValues] = useState<Record<string, string[]>>({});

  useEffect(() => {
    client.getDatabases().then(setDatabases).catch(() => {});
  }, []);

  const toggleNode = useCallback(
    async (id: string, nodeType: string, dbName?: string, _rpName?: string, measurementName?: string, name?: string) => {
      setExpandedNodes((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });

      if (loadedChildren[id]) return;

      setLoading((prev) => new Set(prev).add(id));

      try {
        if (nodeType === 'database' && dbName) {
          const rps = await client.getRetentionPolicies(dbName);
          const children: SchemaNode[] = rps.map((rp) => ({
            type: 'rp',
            name: rp.name,
            dbName,
          }));
          setLoadedChildren((prev) => ({ ...prev, [id]: children }));
        } else if (nodeType === 'rp' && dbName) {
          const measurements = await client.getMeasurements(dbName);
          const children: SchemaNode[] = measurements.map((m) => ({
            type: 'measurement',
            name: m,
            dbName,
            rpName: name,
          }));
          setLoadedChildren((prev) => ({ ...prev, [id]: children }));
        } else if (nodeType === 'measurement' && dbName && measurementName) {
          const [fields, tags] = await Promise.all([
            client.getFieldKeys(dbName, measurementName),
            client.getTagKeys(dbName, measurementName),
          ]);

          const fieldNodes: SchemaNode[] = fields.map((f) => ({
            type: 'field',
            name: f.key,
            fieldType: f.type,
            dbName,
            measurementName,
          }));

          const tagNodes: SchemaNode[] = tags.map((t) => ({
            type: 'tag',
            name: t,
            dbName,
            measurementName,
          }));

          const children: SchemaNode[] = [
            { type: 'fields-header', name: 'Fields', children: fieldNodes },
            { type: 'tags-header', name: 'Tags', children: tagNodes },
          ];
          setLoadedChildren((prev) => ({ ...prev, [id]: children }));
        }
      } catch {
        // swallow errors
      } finally {
        setLoading((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [loadedChildren],
  );

  const flattenNodes = (): FlatSchemaNode[] => {
    const result: FlatSchemaNode[] = [];

    const addDb = (db: string) => {
      const id = `db:${db}`;
      const isExpanded = expandedNodes.has(id);
      result.push({ type: 'database', name: db, dbName: db, depth: 0, id, expanded: isExpanded });

      if (!isExpanded) return;
      const rpChildren = loadedChildren[id] ?? [];
      for (const rp of rpChildren) {
        const rpId = `rp:${db}:${rp.name}`;
        const rpExpanded = expandedNodes.has(rpId);
        result.push({ ...rp, depth: 1, id: rpId, expanded: rpExpanded });

        if (!rpExpanded) continue;
        const measChildren = loadedChildren[rpId] ?? [];
        for (const meas of measChildren) {
          const measId = `meas:${db}:${meas.name}`;
          const measExpanded = expandedNodes.has(measId);
          result.push({ ...meas, depth: 2, id: measId, expanded: measExpanded });

          if (!measExpanded) continue;
          const groupChildren = loadedChildren[measId] ?? [];
          for (const group of groupChildren) {
            const groupId = `group:${db}:${meas.name}:${group.name}`;
            const groupExpanded = expandedNodes.has(groupId);
            result.push({ ...group, depth: 3, id: groupId, expanded: groupExpanded });

            if (!groupExpanded) continue;
            for (const leaf of group.children ?? []) {
              const leafId = `leaf:${db}:${meas.name}:${group.name}:${leaf.name}`;
              result.push({ ...leaf, depth: 4, id: leafId });
            }
          }
        }
      }
    };

    for (const db of databases) {
      addDb(db);
    }

    return result;
  };

  const filtered = search.trim()
    ? flattenNodes().filter((n) => n.name.toLowerCase().includes(search.toLowerCase()))
    : flattenNodes();

  const handleNodeClick = (node: FlatSchemaNode) => {
    if (node.type === 'database') {
      toggleNode(node.id, 'database', node.dbName, undefined, undefined, node.name);
    } else if (node.type === 'rp') {
      toggleNode(node.id, 'rp', node.dbName, node.name, undefined, node.name);
    } else if (node.type === 'measurement') {
      toggleNode(node.id, 'measurement', node.dbName, node.rpName, node.name, node.name);
      onInsert(`FROM "${node.name}"`);
    } else if (node.type === 'fields-header' || node.type === 'tags-header') {
      setExpandedNodes((prev) => {
        const next = new Set(prev);
        if (next.has(node.id)) next.delete(node.id);
        else next.add(node.id);
        return next;
      });
    } else if (node.type === 'field') {
      onInsert(`"${node.name}"`);
    } else if (node.type === 'tag') {
      onInsert(`"${node.name}"`);
      // Toggle tag values
      const tvKey = `tv:${node.dbName}:${node.measurementName}:${node.name}`;
      if (tagValues[tvKey]) {
        setTagValues((prev) => { const next = { ...prev }; delete next[tvKey]; return next; });
      } else if (node.dbName && node.measurementName) {
        setLoading((prev) => new Set(prev).add(tvKey));
        client.getTagValues(node.dbName, node.measurementName, node.name)
          .then((vals) => setTagValues((prev) => ({ ...prev, [tvKey]: vals })))
          .catch(() => {})
          .finally(() => setLoading((prev) => { const next = new Set(prev); next.delete(tvKey); return next; }));
      }
    }
  };

  const renderNodeIcon = (node: FlatSchemaNode) => {
    const isLoading = loading.has(node.id);
    const isExpandable = ['database', 'rp', 'measurement', 'fields-header', 'tags-header'].includes(node.type);
    if (!isExpandable) return <span className="w-4 h-4 inline-block" />;
    if (isLoading) {
      return (
        <svg className="w-4 h-4 animate-spin text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      );
    }
    return node.expanded
      ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
      : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />;
  };

  const nodeLabel = (node: FlatSchemaNode) => {
    const colorClass = node.type === 'field' && node.fieldType
      ? FIELD_TYPE_COLORS[node.fieldType] ?? 'text-gray-300'
      : 'text-gray-300';

    return (
      <span className="flex items-center gap-1 min-w-0">
        <span className={`truncate text-sm ${colorClass}`}>{node.name}</span>
        {node.type === 'field' && node.fieldType && (
          <span className="text-xs text-gray-500 flex-shrink-0 ml-1">{node.fieldType}</span>
        )}
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-700">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Schema Explorer</div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter..."
            className="w-full bg-gray-800 text-gray-300 text-xs pl-7 pr-2 py-1.5 rounded border border-gray-700 focus:outline-none focus:border-blue-500 placeholder-gray-600"
          />
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {filtered.length === 0 && databases.length === 0 && (
          <div className="text-xs text-gray-500 px-3 py-4 text-center">Loading databases...</div>
        )}
        {filtered.length === 0 && databases.length > 0 && search && (
          <div className="text-xs text-gray-500 px-3 py-4 text-center">No results for "{search}"</div>
        )}
        {filtered.map((node) => {
          const tvKey = node.type === 'tag' ? `tv:${node.dbName}:${node.measurementName}:${node.name}` : '';
          const tvLoading = tvKey && loading.has(tvKey);
          const tvList = tvKey ? tagValues[tvKey] : undefined;
          return (
            <div key={node.id}>
              <div
                style={{ paddingLeft: `${node.depth * 16 + 8}px` }}
                className="flex items-center gap-1.5 py-0.5 pr-2 cursor-pointer hover:bg-gray-800 transition-colors duration-150 group select-none"
                onClick={() => handleNodeClick(node)}
              >
                <span className="flex-shrink-0">{renderNodeIcon(node)}</span>
                {nodeLabel(node)}
                {tvLoading && (
                  <svg className="w-3 h-3 animate-spin text-gray-500 ml-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                )}
              </div>
              {tvList && tvList.length > 0 && (
                <div style={{ paddingLeft: `${(node.depth + 1) * 16 + 8}px` }} className="py-0.5">
                  <div className="flex flex-wrap gap-1 py-1">
                    {tvList.slice(0, 50).map((val) => (
                      <span key={val} onClick={() => onInsert(`'${val}'`)}
                        className="inline-block px-1.5 py-0.5 text-[10px] bg-gray-800 border border-gray-700 rounded text-cyan-300 cursor-pointer hover:bg-gray-700 font-mono truncate max-w-[120px]"
                        title={val}>
                        {val}
                      </span>
                    ))}
                    {tvList.length > 50 && <span className="text-[10px] text-gray-500">+{tvList.length - 50} more</span>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Results Table ──────────────────────────────────────────────────────────────

interface ResultsTableProps {
  series: ParsedSeries[];
  humanTime?: boolean;
  epochUnit?: string;
}

function ResultsTable({ series, humanTime, epochUnit = '' }: ResultsTableProps) {
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  if (series.length === 0) {
    return <div className="text-gray-500 text-sm text-center py-8">No results</div>;
  }

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  return (
    <div className="flex flex-col gap-4 h-full overflow-y-auto">
      {series.map((s, si) => {
        const label = s.name + buildTagLabel(s.tags);
        let rows = [...s.rows];

        if (sortCol && s.columns.includes(sortCol)) {
          rows.sort((a, b) => {
            const av = a[sortCol];
            const bv = b[sortCol];
            if (av === null || av === undefined) return 1;
            if (bv === null || bv === undefined) return -1;
            const cmp = av < bv ? -1 : av > bv ? 1 : 0;
            return sortDir === 'asc' ? cmp : -cmp;
          });
        }

        return (
          <div key={si} className="flex flex-col min-w-0">
            {series.length > 1 && (
              <div className="text-xs font-medium text-blue-400 px-1 mb-1">{label}</div>
            )}
            <div className="overflow-x-auto rounded border border-gray-700">
              <table className="min-w-full text-xs bg-gray-800">
                <thead>
                  <tr className="border-b border-gray-700">
                    {s.columns.map((col) => (
                      <th
                        key={col}
                        onClick={() => handleSort(col)}
                        className="px-3 py-2 text-left font-semibold text-gray-400 cursor-pointer hover:text-gray-200 hover:bg-gray-750 select-none whitespace-nowrap transition-colors duration-150"
                      >
                        <span className="flex items-center gap-1">
                          {col}
                          {sortCol === col && (
                            <span className="text-blue-400">{sortDir === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, ri) => (
                    <tr key={ri} className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors duration-150">
                      {s.columns.map((col) => {
                        const v = row[col];
                        const isTimeCol = /^time$/i.test(col);
                        let display: React.ReactNode;
                        if (v === null || v === undefined) {
                          display = <span className="text-gray-600 italic">null</span>;
                        } else if (humanTime && isTimeCol) {
                          const readable = formatTimestampValue(v, epochUnit);
                          display = (
                            <span title={String(v)}>{readable}</span>
                          );
                        } else {
                          display = String(v);
                        }
                        return (
                          <td key={col} className="px-3 py-1.5 text-gray-300 whitespace-nowrap font-mono">
                            {display}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-xs text-gray-500 mt-1 px-1">{rows.length} row{rows.length !== 1 ? 's' : ''}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Results Chart ──────────────────────────────────────────────────────────────

interface ResultsChartProps {
  series: ParsedSeries[];
}

function ResultsChart({ series }: ResultsChartProps) {
  if (series.length === 0) {
    return <div className="text-gray-500 text-sm text-center py-8">No results</div>;
  }

  // Determine value columns (non-time columns that are numeric-ish)
  const firstSeries = series[0];
  const timeCol = firstSeries.columns.find((c) => c === 'time') ?? null;
  const valueColumns = firstSeries.columns.filter((c) => c !== 'time' && c !== 'name');

  if (!timeCol) {
    return (
      <div className="text-gray-500 text-sm text-center py-8">
        Chart requires a 'time' column in the results.
      </div>
    );
  }

  // Merge all series into chart data keyed by time
  const dataMap = new Map<string, Record<string, any>>();

  series.forEach((s) => {
    const tagLabel = buildTagLabel(s.tags);
    s.rows.forEach((row) => {
      const t = String(row[timeCol]);
      if (!dataMap.has(t)) dataMap.set(t, { time: t });
      const point = dataMap.get(t)!;
      valueColumns.forEach((col) => {
        const key = series.length > 1 ? `${s.name}${tagLabel ? tagLabel : ''}.${col}` : col;
        const val = row[col];
        if (val !== null && val !== undefined) {
          point[key] = typeof val === 'number' ? val : parseFloat(val);
        }
      });
    });
  });

  const chartData = Array.from(dataMap.values()).sort((a, b) =>
    a.time < b.time ? -1 : a.time > b.time ? 1 : 0,
  );

  // Collect all data keys
  const lineKeys: string[] = [];
  series.forEach((s) => {
    const tagLabel = buildTagLabel(s.tags);
    valueColumns.forEach((col) => {
      const key = series.length > 1 ? `${s.name}${tagLabel ? tagLabel : ''}.${col}` : col;
      if (!lineKeys.includes(key)) lineKeys.push(key);
    });
  });

  const formatXTick = (val: string) => {
    try {
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString();
      }
    } catch {
      // ignore
    }
    return val;
  };

  return (
    <div className="w-full h-full min-h-0">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            dataKey="time"
            tickFormatter={formatXTick}
            tick={{ fill: '#9ca3af', fontSize: 11 }}
            axisLine={{ stroke: '#4b5563' }}
            tickLine={{ stroke: '#4b5563' }}
          />
          <YAxis
            tick={{ fill: '#9ca3af', fontSize: 11 }}
            axisLine={{ stroke: '#4b5563' }}
            tickLine={{ stroke: '#4b5563' }}
            width={60}
          />
          <Tooltip
            contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '6px' }}
            labelStyle={{ color: '#9ca3af', fontSize: 11 }}
            itemStyle={{ color: '#d1d5db', fontSize: 12 }}
            formatter={(value: any) => [typeof value === 'number' ? value.toLocaleString() : value]}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, color: '#9ca3af', paddingTop: '8px' }}
          />
          {lineKeys.map((key, i) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              dot={false}
              strokeWidth={2}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Query History Dropdown ─────────────────────────────────────────────────────

interface HistoryDropdownProps {
  onSelect: (query: string) => void;
}

function HistoryDropdown({ onSelect }: HistoryDropdownProps) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = () => setHistory(loadHistory());

  useEffect(() => {
    if (!open) return;
    refresh();
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded border border-gray-600 transition-colors duration-150"
      >
        <Clock className="w-3.5 h-3.5" />
        History
        <ChevronDown className="w-3 h-3 text-gray-500" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-96 bg-gray-800 border border-gray-600 rounded shadow-2xl z-50 max-h-80 overflow-y-auto">
          {history.length === 0 ? (
            <div className="text-gray-500 text-xs text-center py-4">No query history</div>
          ) : (
            history.map((q, i) => (
              <div
                key={i}
                onClick={() => { onSelect(q); setOpen(false); }}
                className="px-3 py-2 text-xs text-gray-300 hover:bg-gray-700 cursor-pointer truncate border-b border-gray-700 last:border-0 font-mono transition-colors duration-150"
                title={q}
              >
                {q}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function QueryExplorer() {
  const [databases, setDatabases] = useState<string[]>([]);
  const [selectedDb, setSelectedDb] = useState<string>(loadLastDb());
  const [retentionPolicies, setRetentionPolicies] = useState<any[]>([]);
  const [selectedRp, setSelectedRp] = useState<string>('');
  const [epoch, setEpoch] = useState<string>('rfc3339');
  const [query, setQuery] = useState<string>('SELECT * FROM "measurement" LIMIT 100');
  const [results, setResults] = useState<QueryResults | null>(null);
  const [running, setRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<'table' | 'chart'>('table');
  const [humanTime, setHumanTime] = useState(true);
  const [connectionKey, setConnectionKey] = useState(0);

  // Re-fetch everything when the connection changes
  useEffect(() => {
    const handler = () => {
      setConnectionKey((k) => k + 1);
      setResults(null);
      setSelectedDb('');
      setRetentionPolicies([]);
      setSelectedRp('');
      client.getDatabases().then((dbs) => {
        setDatabases(dbs);
        if (dbs.length > 0) { setSelectedDb(dbs[0]); saveLastDb(dbs[0]); }
      }).catch(() => { setDatabases([]); });
    };
    window.addEventListener('tidedb-connection-change', handler);
    return () => window.removeEventListener('tidedb-connection-change', handler);
  }, []);

  // Load databases on mount
  useEffect(() => {
    client.getDatabases().then((dbs) => {
      setDatabases(dbs);
      if (!selectedDb && dbs.length > 0) {
        setSelectedDb(dbs[0]);
        saveLastDb(dbs[0]);
      }
    }).catch(() => {});
  }, []);

  // Load RPs when db changes
  useEffect(() => {
    if (!selectedDb) {
      setRetentionPolicies([]);
      setSelectedRp('');
      return;
    }
    saveLastDb(selectedDb);
    client.getRetentionPolicies(selectedDb).then((rps) => {
      setRetentionPolicies(rps);
      const def = rps.find((r) => r.default);
      setSelectedRp(def?.name ?? rps[0]?.name ?? '');
    }).catch(() => {
      setRetentionPolicies([]);
      setSelectedRp('');
    });
  }, [selectedDb]);

  const executeQuery = useCallback(async () => {
    if (!query.trim() || running) return;
    setRunning(true);
    const start = performance.now();
    try {
      pushHistory(query.trim());
      const raw = await client.query(query.trim(), selectedDb || undefined, epoch || undefined);
      const duration = Math.round(performance.now() - start);
      const error = raw.results?.[0]?.error;
      const series = parseQueryResults(raw);
      setResults({ series, duration, error });
    } catch (err: any) {
      const duration = Math.round(performance.now() - start);
      setResults({ series: [], duration, error: err?.message ?? 'Unknown error' });
    } finally {
      setRunning(false);
    }
  }, [query, selectedDb, epoch, running]);

  const handleFormat = () => {
    setQuery((q) => formatQuery(q));
  };

  const handleInsert = useCallback((text: string) => {
    setQuery((q) => {
      const trimmed = q.trimEnd();
      const sep = trimmed.length > 0 ? ' ' : '';
      return trimmed + sep + text;
    });
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      executeQuery();
    }
  };

  const totalRows = results?.series.reduce((acc, s) => acc + s.rows.length, 0) ?? 0;

  return (
    <div className="flex flex-col h-full bg-gray-950 text-gray-100">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-900 border-b border-gray-700 flex-shrink-0">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Query Explorer</span>
        <div className="flex items-center gap-2 ml-2">
          <label className="text-xs text-gray-500">Database</label>
          <select
            value={selectedDb}
            onChange={(e) => setSelectedDb(e.target.value)}
            className="bg-gray-800 border border-gray-600 text-gray-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-blue-500 transition-colors duration-150"
          >
            <option value="">— select —</option>
            {databases.map((db) => (
              <option key={db} value={db}>{db}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">RP</label>
          <select
            value={selectedRp}
            onChange={(e) => setSelectedRp(e.target.value)}
            className="bg-gray-800 border border-gray-600 text-gray-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-blue-500 transition-colors duration-150"
            disabled={retentionPolicies.length === 0}
          >
            <option value="">— default —</option>
            {retentionPolicies.map((rp) => (
              <option key={rp.name} value={rp.name}>
                {rp.name}{rp.default ? ' (default)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Epoch</label>
          <select
            value={epoch}
            onChange={(e) => setEpoch(e.target.value)}
            className="bg-gray-800 border border-gray-600 text-gray-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-blue-500 transition-colors duration-150"
          >
            {EPOCH_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: Schema Explorer */}
        <div
          className="flex-shrink-0 border-r border-gray-700 overflow-hidden flex flex-col"
          style={{ width: '250px' }}
        >
          <SchemaExplorer key={connectionKey} onInsert={handleInsert} />
        </div>

        {/* Right: Editor + Results */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {/* Query Editor */}
          <div
            className="flex-shrink-0 border-b border-gray-700 flex flex-col"
            style={{ height: '200px' }}
          >
            {/* Editor toolbar */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-gray-900 border-b border-gray-700">
              <span className="text-xs text-gray-500">InfluxQL  ·  Ctrl+Enter to run</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleFormat}
                  className="px-2.5 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded border border-gray-600 transition-colors duration-150"
                >
                  Format
                </button>
                <HistoryDropdown onSelect={setQuery} />
                <button
                  onClick={() => { const q = query.trim(); if (q && !q.toUpperCase().startsWith('EXPLAIN')) { setQuery('EXPLAIN ' + q); } executeQuery(); }}
                  disabled={running}
                  title="Explain query plan"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-amber-700 hover:bg-amber-600 disabled:bg-amber-900 disabled:text-amber-400 text-white rounded transition-colors duration-150"
                >
                  <Zap className="w-3.5 h-3.5" />
                  Explain
                </button>
                <button
                  onClick={executeQuery}
                  disabled={running}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:bg-blue-900 disabled:text-blue-400 text-white rounded transition-colors duration-150"
                >
                  <Play className="w-3.5 h-3.5" />
                  {running ? 'Running…' : 'Run'}
                </button>
              </div>
            </div>

            {/* CodeMirror editor */}
            <div
              className="flex-1 overflow-hidden"
              onKeyDown={handleKeyDown}
            >
              <CodeMirror
                value={query}
                onChange={setQuery}
                extensions={[sql()]}
                theme="dark"
                height="150px"
                style={{
                  height: '150px',
                  fontSize: '13px',
                  backgroundColor: '#1f2937',
                }}
                basicSetup={{
                  lineNumbers: true,
                  highlightActiveLineGutter: true,
                  highlightActiveLine: true,
                  bracketMatching: true,
                  autocompletion: true,
                  indentOnInput: true,
                }}
              />
            </div>
          </div>

          {/* Results Panel */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Tabs */}
            <div className="flex items-center gap-1 px-3 py-1.5 bg-gray-900 border-b border-gray-700 flex-shrink-0">
              <button
                onClick={() => setActiveTab('table')}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded transition-colors duration-150 ${
                  activeTab === 'table'
                    ? 'bg-gray-700 text-gray-100'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`}
              >
                <Table2 className="w-3.5 h-3.5" />
                Table
              </button>
              <button
                onClick={() => setActiveTab('chart')}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded transition-colors duration-150 ${
                  activeTab === 'chart'
                    ? 'bg-gray-700 text-gray-100'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                Chart
              </button>
              {results && !results.error && (
                <div className="ml-auto flex items-center gap-3">
                  {/* Human-readable timestamp toggle */}
                  <label className="flex items-center gap-1.5 cursor-pointer select-none" title="Toggle between raw epoch and readable timestamps">
                    <Clock className="w-3 h-3 text-gray-500" />
                    <span className="text-xs text-gray-500">Readable time</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={humanTime}
                      onClick={() => setHumanTime((v) => !v)}
                      className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors duration-200 ${humanTime ? 'bg-blue-600' : 'bg-gray-600'}`}
                    >
                      <span className={`inline-block h-3 w-3 rounded-full bg-white transition-transform duration-200 ${humanTime ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                    </button>
                  </label>
                  <span className="text-xs text-gray-600">|</span>
                  <span className="text-xs text-gray-500">
                    {totalRows} row{totalRows !== 1 ? 's' : ''}
                  </span>
                  <button onClick={() => exportCSV(results.series)} title="Download CSV"
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded border border-gray-600 transition-colors duration-150">
                    <Download className="w-3 h-3" /> CSV
                  </button>
                  <button onClick={() => exportJSON(results.series)} title="Download JSON"
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded border border-gray-600 transition-colors duration-150">
                    <FileJson className="w-3 h-3" /> JSON
                  </button>
                </div>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden min-h-0 bg-gray-950 p-3">
              {!results && (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-600">
                  <Play className="w-8 h-8 opacity-30" />
                  <span className="text-sm">Run a query to see results</span>
                </div>
              )}
              {results && results.error && (
                <div className="bg-red-950/50 border border-red-700 rounded p-3 text-red-300 text-sm font-mono">
                  {results.error}
                </div>
              )}
              {results && !results.error && (
                <div className="h-full overflow-hidden">
                  {activeTab === 'table' && <ResultsTable series={results.series} humanTime={humanTime} epochUnit={epoch} />}
                  {activeTab === 'chart' && <ResultsChart series={results.series} />}
                </div>
              )}
            </div>

            {/* Status bar */}
            <div className="flex-shrink-0 flex items-center gap-3 px-3 py-1 bg-gray-900 border-t border-gray-700 text-xs text-gray-500">
              {running && (
                <span className="flex items-center gap-1.5 text-blue-400">
                  <svg className="w-3 h-3 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Executing…
                </span>
              )}
              {results && !running && (
                <>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDuration(results.duration)}
                  </span>
                  {!results.error && (
                    <span>{totalRows} row{totalRows !== 1 ? 's' : ''} returned</span>
                  )}
                  {results.error && (
                    <span className="text-red-400">Query failed</span>
                  )}
                </>
              )}
              {!results && !running && (
                <span>Ready</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
