// VictoriaMetrics API Client
// Handles VM-exclusive endpoints not covered by the Prometheus-compatible API.
// For shared endpoints (query, targets, rules, etc.), use prometheus.ts directly.

import { basePath } from '../config';

const VM_PROXY_BASE = basePath + '/proxy/victoriametrics/';

function buildURL(target: string, path: string, params?: Record<string, string>): string {
  const sp = new URLSearchParams();
  sp.set('target', target);
  sp.set('path', path);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') sp.set(k, v);
    }
  }
  return VM_PROXY_BASE + '?' + sp.toString();
}

function authHeaders(auth?: { username?: string; password?: string }): Record<string, string> {
  const h: Record<string, string> = {};
  if (auth?.username) h['X-Proxy-Username'] = auth.username;
  if (auth?.password) h['X-Proxy-Password'] = auth.password;
  return h;
}

async function doFetch<T>(url: string, opts?: RequestInit, auth?: { username?: string; password?: string }): Promise<T> {
  const res = await fetch(url, {
    ...opts,
    headers: { Accept: 'application/json', ...authHeaders(auth), ...((opts?.headers as Record<string, string>) || {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Request failed (${res.status}): ${text}`);
  }
  return res.json();
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface TopQueryEntry {
  query: string;
  count: number;
  timeRangeSeconds: number;
  avgDurationSeconds: number;
}

export interface TopQueries {
  topByCount: TopQueryEntry[];
  topByAvgDuration: TopQueryEntry[];
  topBySumDuration: TopQueryEntry[];
}

export interface ActiveQuery {
  duration: string;
  id: string;
  remote_addr: string;
  query: string;
  start: number;
  end: number;
  step: number;
}

export interface VmTsdbStatus {
  totalSeries?: number;
  totalSeriesByAll?: number;
  totalSeriesPrev?: number;
  seriesCountByMetricName: Array<{ name: string; value: number }>;
  seriesCountByLabelName: Array<{ name: string; value: number }>;
  seriesCountByFocusLabelValue: Array<{ name: string; value: number }>;
  seriesCountByLabelValuePair: Array<{ name: string; value: number }>;
  labelValueCountByLabelName: Array<{ name: string; value: number }>;
}

export interface SnapshotResponse {
  status: string;
  snapshot?: string;
  snapshots?: string[];
  msg?: string;
}

// ── Status & Monitoring ─────────────────────────────────────────────────────

export async function getActiveQueries(
  target: string,
  auth?: { username?: string; password?: string },
): Promise<ActiveQuery[]> {
  const url = buildURL(target, '/api/v1/status/active_queries');
  const resp = await doFetch<{ status: string; data: ActiveQuery[] }>(url, undefined, auth);
  return resp.data || [];
}

export async function getTopQueries(
  target: string,
  topN = 20,
  maxLifetime = '30m',
  auth?: { username?: string; password?: string },
): Promise<TopQueries> {
  const url = buildURL(target, '/api/v1/status/top_queries', { topN: String(topN), maxLifetime });
  const resp = await doFetch<{ status: string; data: TopQueries }>(url, undefined, auth);
  return resp.data;
}

export async function getSeriesCount(
  target: string,
  auth?: { username?: string; password?: string },
): Promise<number> {
  const url = buildURL(target, '/api/v1/series/count');
  const resp = await doFetch<{ status: string; data: number[] }>(url, undefined, auth);
  return resp.data?.[0] ?? 0;
}

export async function getTsdbStatusEnhanced(
  target: string,
  opts: { topN?: number; focusLabel?: string; date?: string; match?: string },
  auth?: { username?: string; password?: string },
): Promise<VmTsdbStatus> {
  const params: Record<string, string> = {};
  if (opts.topN) params.topN = String(opts.topN);
  if (opts.focusLabel) params.focusLabel = opts.focusLabel;
  if (opts.date) params.date = opts.date;
  if (opts.match) params['match[]'] = opts.match;
  const url = buildURL(target, '/api/v1/status/tsdb', params);
  const resp = await doFetch<{ status: string; data: VmTsdbStatus }>(url, undefined, auth);
  return resp.data;
}

// ── Snapshots ───────────────────────────────────────────────────────────────

export async function listSnapshots(
  target: string,
  auth?: { username?: string; password?: string },
): Promise<string[]> {
  const url = buildURL(target, '/snapshot/list');
  const resp = await doFetch<SnapshotResponse>(url, undefined, auth);
  return resp.snapshots || [];
}

export async function createSnapshot(
  target: string,
  auth?: { username?: string; password?: string },
): Promise<string> {
  const url = buildURL(target, '/snapshot/create');
  const resp = await doFetch<SnapshotResponse>(url, undefined, auth);
  return resp.snapshot || '';
}

export async function deleteSnapshot(
  target: string,
  name: string,
  auth?: { username?: string; password?: string },
): Promise<void> {
  const url = buildURL(target, '/snapshot/delete', { snapshot: name });
  await doFetch<SnapshotResponse>(url, undefined, auth);
}

export async function deleteAllSnapshots(
  target: string,
  auth?: { username?: string; password?: string },
): Promise<void> {
  const url = buildURL(target, '/snapshot/delete_all');
  await doFetch<SnapshotResponse>(url, undefined, auth);
}

// ── Admin Operations ────────────────────────────────────────────────────────

export async function forceMerge(
  target: string,
  partition: string,
  auth?: { username?: string; password?: string },
): Promise<void> {
  const url = buildURL(target, '/internal/force_merge', { partition_prefix: partition });
  await fetch(url, { headers: authHeaders(auth) });
}

export async function resetCache(
  target: string,
  auth?: { username?: string; password?: string },
): Promise<void> {
  const url = buildURL(target, '/internal/resetRollupResultCache');
  await fetch(url, { headers: authHeaders(auth) });
}

export async function deleteSeries(
  target: string,
  match: string,
  auth?: { username?: string; password?: string },
): Promise<void> {
  const url = buildURL(target, '/api/v1/admin/tsdb/delete_series', { 'match[]': match });
  await fetch(url, { method: 'POST', headers: authHeaders(auth) });
}

// ── Export ───────────────────────────────────────────────────────────────────

export async function exportData(
  target: string,
  opts: { match: string; start?: string; end?: string; format: 'json' | 'csv' | 'native'; csvFormat?: string },
  auth?: { username?: string; password?: string },
): Promise<string> {
  const pathMap = { json: '/api/v1/export', csv: '/api/v1/export/csv', native: '/api/v1/export/native' };
  const params: Record<string, string> = { 'match[]': opts.match };
  if (opts.start) params.start = opts.start;
  if (opts.end) params.end = opts.end;
  if (opts.csvFormat) params.format = opts.csvFormat;
  const url = buildURL(target, pathMap[opts.format], params);
  const res = await fetch(url, { headers: authHeaders(auth) });
  return res.text();
}

// ── Import ──────────────────────────────────────────────────────────────────

export async function importData(
  target: string,
  opts: { format: 'json' | 'csv' | 'native' | 'prometheus'; body: string | Blob; csvFormat?: string },
  auth?: { username?: string; password?: string },
): Promise<void> {
  const pathMap: Record<string, string> = {
    json: '/api/v1/import',
    csv: '/api/v1/import/csv',
    native: '/api/v1/import/native',
    prometheus: '/api/v1/import/prometheus',
  };
  const params: Record<string, string> = {};
  if (opts.csvFormat) params.format = opts.csvFormat;
  const url = buildURL(target, pathMap[opts.format], params);
  await fetch(url, { method: 'POST', body: opts.body, headers: authHeaders(auth) });
}

// ── Health Check ────────────────────────────────────────────────────────────

export async function checkHealth(
  target: string,
  auth?: { username?: string; password?: string },
): Promise<boolean> {
  try {
    const url = buildURL(target, '/-/healthy');
    const res = await fetch(url, { headers: authHeaders(auth) });
    return res.ok;
  } catch {
    return false;
  }
}

const vmClient = {
  getActiveQueries,
  getTopQueries,
  getSeriesCount,
  getTsdbStatusEnhanced,
  listSnapshots,
  createSnapshot,
  deleteSnapshot,
  deleteAllSnapshots,
  forceMerge,
  resetCache,
  deleteSeries,
  exportData,
  importData,
  checkHealth,
};

export default vmClient;
