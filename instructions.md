# TimeseriesUI — VictoriaMetrics Integration Spec

**Date:** 2026-02-19
**Branch:** `claude/unified-timeseries-ui-y2lIf`
**Scope:** Add VictoriaMetrics as a third backend connection type
**Effort:** Medium — VictoriaMetrics speaks both the Prometheus API and InfluxDB write API, so ~70% of the work is reuse. The new pages cover VM-exclusive features only.

-----

## Table of Contents

1. [Strategy](#1-strategy)
1. [Connection Model](#2-connection-model)
1. [CLI Additions](#3-cli-additions)
1. [Proxy Routing](#4-proxy-routing)
1. [Sidebar Navigation](#5-sidebar-navigation)
1. [API Reference — VM-Exclusive Endpoints](#6-api-reference--vm-exclusive-endpoints)
1. [New UI Pages (VM-Exclusive)](#7-new-ui-pages-vm-exclusive)
1. [Reused Pages (from Prometheus)](#8-reused-pages-from-prometheus)
1. [Implementation Phases](#9-implementation-phases)
1. [Docker Testing Environment](#10-docker-testing-environment)
1. [File Structure](#11-file-structure)

-----

## 1. Strategy

### Why a separate connection type?

VictoriaMetrics is Prometheus-API-compatible, so all existing Prometheus pages work against VM out of the box. However, VM has significant exclusive features that justify a first-class connection type:

|Feature                |Prometheus             |VictoriaMetrics                                                           |
|-----------------------|-----------------------|--------------------------------------------------------------------------|
|Query language         |PromQL                 |MetricsQL (superset of PromQL)                                            |
|Export/Import          |No HTTP API            |JSON, CSV, native binary                                                  |
|Snapshots              |Only via admin API flag|Built-in `/snapshot/*`                                                    |
|Forced merge           |N/A                    |`/internal/force_merge`                                                   |
|Top queries            |N/A                    |`/api/v1/status/top_queries`                                              |
|Active queries         |N/A                    |`/api/v1/status/active_queries`                                           |
|Series count           |N/A                    |`/api/v1/series/count`                                                    |
|Cardinality (enhanced) |Basic TSDB stats       |Extended with `topN`, `focusLabel`, date range                            |
|Multi-tenancy (cluster)|N/A                    |`accountID:projectID` in URL path                                         |
|Cache reset            |N/A                    |`/internal/resetRollupResultCache`                                        |
|Write protocols        |Remote write only      |Prometheus, InfluxDB line protocol, CSV, JSON, Datadog, OpenTSDB, Graphite|
|InfluxDB-compat write  |N/A                    |`/influx/write` (same as InfluxDB 1.x)                                    |

### Architecture principle

**Reuse, don’t duplicate.** A VictoriaMetrics connection renders the Prometheus page components where applicable and adds VM-exclusive pages on top. The React components are shared — only the sidebar menu and a few extra pages differ.

```
VictoriaMetrics connection type
├── Reuses: PromQueryExplorer (MetricsQL is a superset of PromQL)
├── Reuses: PromTargets (same /api/v1/targets API)
├── Reuses: PromAlertRules (same /api/v1/rules API)
├── Reuses: PromAlertmanager (if alertmanagerUrl configured)
├── Reuses: PromMetrics (same /api/v1/metadata API)
├── Reuses: PromConfig (same /api/v1/status/config API)
├── Reuses: PromServiceDiscovery (same /api/v1/targets API)
├── NEW: VmTSDB (enhanced cardinality explorer)
├── NEW: VmActiveQueries (live + top queries)
├── NEW: VmExportImport (data migration tool)
├── NEW: VmSnapshots (backup management)
└── NEW: VmAdmin (force merge, cache reset, series count)
```

-----

## 2. Connection Model

### TypeScript Interface

```typescript
interface VictoriaMetricsConnection {
  id: string;
  type: 'victoriametrics';
  name: string;
  url: string;                    // e.g. http://localhost:8428
  username?: string;              // Basic auth
  password?: string;
  alertmanagerUrl?: string;       // Optional, for alerting pages
  clusterMode?: boolean;          // If true, URL points to vmselect
  tenantId?: string;              // e.g. "0" or "0:0" (accountID:projectID)
  // Cluster URLs (optional, for admin operations)
  vminsertUrl?: string;           // e.g. http://vminsert:8480
  vmstorageUrls?: string[];       // e.g. ["http://vmstorage1:8482"]
}
```

### localStorage Schema

Stored alongside existing connections in `timeseriesui_connections`:

```json
{
  "id": "vm-prod-1",
  "type": "victoriametrics",
  "name": "VM Production",
  "url": "http://victoriametrics:8428",
  "clusterMode": false,
  "tenantId": ""
}
```

### Cluster vs Single-Node URL Routing

The proxy must handle both deployment modes:

|Mode           |Query URL Pattern                                               |Write URL Pattern                                                |
|---------------|----------------------------------------------------------------|-----------------------------------------------------------------|
|**Single-node**|`http://vm:8428/api/v1/query`                                   |`http://vm:8428/api/v1/import`                                   |
|**Cluster**    |`http://vmselect:8481/select/<tenantId>/prometheus/api/v1/query`|`http://vminsert:8480/insert/<tenantId>/prometheus/api/v1/import`|

The frontend constructs the full URL path based on `clusterMode` and `tenantId`:

```typescript
function vmApiUrl(conn: VictoriaMetricsConnection, path: string): string {
  if (conn.clusterMode && conn.tenantId) {
    // Cluster mode: prefix with tenant path
    // Query endpoints go to vmselect
    return `/select/${conn.tenantId}/prometheus${path}`;
  }
  // Single-node: standard Prometheus-compatible path
  // VM accepts both /api/v1/query and /prometheus/api/v1/query
  return path;
}
```

### Connection Dialog

Add a “VictoriaMetrics” option to the existing connection type dropdown. When selected, show:

```
┌─────────────────────────────────────────────────┐
│  Add Connection                                 │
│                                                 │
│  Type: [InfluxDB ▼] [Prometheus] [VictoriaMetrics ●]│
│                                                 │
│  Name:        [VM Production              ]     │
│  URL:         [http://localhost:8428       ]     │
│  Username:    [                            ]     │
│  Password:    [                            ]     │
│                                                 │
│  ☐ Cluster mode                                 │
│    Tenant ID:     [0:0                    ]     │
│    vminsert URL:  [                       ]     │
│    vmstorage URLs:[                       ]     │
│                                                 │
│  Alertmanager URL: [                      ]     │
│                                                 │
│  [Test Connection]              [Save] [Cancel] │
└─────────────────────────────────────────────────┘
```

**Test Connection** hits `<url>/-/healthy` — VM returns “VictoriaMetrics is Healthy”.

-----

## 3. CLI Additions

Add these new flags to `main.go`:

```
CONNECTION FLAGS:
  --victoriametrics-url string    Add a default VictoriaMetrics connection (repeatable)
  --victoriametrics-user string   Default VM basic-auth username
  --victoriametrics-password string Default VM basic-auth password
  --victoriametrics-name string   Display name for the VM connection
  --victoriametrics-tenant string Tenant ID for cluster mode (e.g. "0" or "0:0")
```

Short alias: `--vm-url`, `--vm-user`, `--vm-password`, `--vm-name`, `--vm-tenant`

### Example usage

```bash
# Single-node VM
./timeseriesui --vm-url http://localhost:8428

# Cluster VM with tenant
./timeseriesui \
  --vm-url http://vmselect:8481 \
  --vm-tenant 0:0

# Everything together
./timeseriesui \
  --influxdb-url http://localhost:8086 \
  --prometheus-url http://localhost:9090 \
  --vm-url http://localhost:8428 \
  --alertmanager-url http://localhost:9093
```

### Connections file addition

```json
{
  "connections": [
    {
      "name": "VM Single-node",
      "type": "victoriametrics",
      "url": "http://vm:8428"
    },
    {
      "name": "VM Cluster Tenant 0",
      "type": "victoriametrics",
      "url": "http://vmselect:8481",
      "clusterMode": true,
      "tenantId": "0:0",
      "vminsertUrl": "http://vminsert:8480",
      "vmstorageUrls": ["http://vmstorage1:8482", "http://vmstorage2:8482"]
    }
  ]
}
```

-----

## 4. Proxy Routing

The existing generic proxy architecture already handles this. The frontend just constructs different target URLs:

```
/proxy/victoriametrics/?target=http://vm:8428&path=/api/v1/query&query=up

# For cluster mode, the path includes the tenant prefix:
/proxy/victoriametrics/?target=http://vmselect:8481&path=/select/0/prometheus/api/v1/query&query=up
```

**No changes to Go proxy code needed.** The proxy is backend-agnostic — it just forwards requests to `target + path + querystring`.

For VM-exclusive endpoints that don’t share the Prometheus API path structure:

```
# Snapshots (single-node)
/proxy/victoriametrics/?target=http://vm:8428&path=/snapshot/create

# Force merge (single-node)
/proxy/victoriametrics/?target=http://vm:8428&path=/internal/force_merge&partition_prefix=2026_01

# Export
/proxy/victoriametrics/?target=http://vm:8428&path=/api/v1/export&match[]=vm_http_request_errors_total

# Cluster vmstorage admin (targets vmstorage node directly)
/proxy/victoriametrics/?target=http://vmstorage1:8482&path=/snapshot/create
```

-----

## 5. Sidebar Navigation

When a VictoriaMetrics connection is active, show:

```
┌──────────────────────┐
│ 🔥 VM Production     │  ← VM flame icon, green dot
│                      │
│ QUERY                │
│  ▸ Query Explorer    │  ← Reuses PromQueryExplorer (MetricsQL)
│  ▸ Metric Explorer   │  ← Reuses PromMetrics
│                      │
│ MONITORING           │
│  ▸ Targets           │  ← Reuses PromTargets
│  ▸ Service Discovery │  ← Reuses PromServiceDiscovery
│  ▸ Active Queries    │  ← NEW — VM exclusive
│                      │
│ ALERTING             │
│  ▸ Alert Rules       │  ← Reuses PromAlertRules
│  ▸ Alertmanager      │  ← Reuses PromAlertmanager (if URL set)
│                      │
│ STORAGE              │
│  ▸ TSDB Status       │  ← NEW — Enhanced VM cardinality
│  ▸ Snapshots         │  ← NEW — VM exclusive
│  ▸ Export / Import   │  ← NEW — VM exclusive
│                      │
│ ADMIN                │
│  ▸ Config            │  ← Reuses PromConfig
│  ▸ Admin Operations  │  ← NEW — force merge, cache, delete
│                      │
│ ──────────────────── │
│  ⚙ Settings          │
│  🔗 Connections      │
└──────────────────────┘
```

**Menu items hidden in `--readonly` mode:** Snapshots (create/delete), Export/Import (import), Admin Operations.

-----

## 6. API Reference — VM-Exclusive Endpoints

These are the endpoints that only VictoriaMetrics provides (not available in stock Prometheus).

### 6.1 Status & Monitoring

#### GET `/api/v1/status/top_queries`

Returns the most frequently executed, slowest, and most resource-intensive queries.

Query params: `topN` (int, default 20), `maxLifetime` (duration, e.g. `30m`)

```json
{
  "status": "success",
  "data": {
    "topByCount": [
      { "query": "up", "count": 1234, "timeRangeSeconds": 300, "avgDurationSeconds": 0.012 }
    ],
    "topByAvgDuration": [
      { "query": "histogram_quantile(0.99, ...)", "count": 56, "timeRangeSeconds": 3600, "avgDurationSeconds": 2.5 }
    ],
    "topBySumDuration": [
      { "query": "rate(http_requests_total[5m])", "count": 500, "timeRangeSeconds": 300, "avgDurationSeconds": 0.1 }
    ]
  }
}
```

#### GET `/api/v1/status/active_queries`

Returns currently executing queries.

```json
{
  "status": "success",
  "data": [
    {
      "duration": "0.5s",
      "id": "17",
      "remote_addr": "192.168.1.100:54321",
      "query": "rate(http_requests_total[5m])",
      "start": 1700000000,
      "end": 1700003600,
      "step": 15
    }
  ]
}
```

#### GET `/api/v1/series/count`

Returns the total number of time series in the database.

```json
{
  "status": "success",
  "data": [
    147523
  ]
}
```

#### GET `/api/v1/status/tsdb` (Enhanced vs Prometheus)

VictoriaMetrics extends the standard Prometheus TSDB status endpoint with extra query params:

Query params:

- `topN` (int) — number of top entries to return (default 10)
- `focusLabel` (string) — show top values for this label
- `match[]` (string) — filter by series selector
- `date` (string, YYYYMMDD) — stats for specific date (default: today)
- `start` / `end` — time range for stats

```json
{
  "status": "success",
  "data": {
    "totalSeries": 147523,
    "totalSeriesByAll": 147523,
    "totalSeriesPrev": 145200,
    "seriesCountByMetricName": [
      { "name": "kube_pod_info", "value": 12345 }
    ],
    "seriesCountByLabelName": [
      { "name": "__name__", "value": 147523 },
      { "name": "instance", "value": 89000 }
    ],
    "seriesCountByFocusLabelValue": [
      { "name": "prod-cluster-1", "value": 45000 }
    ],
    "seriesCountByLabelValuePair": [
      { "name": "job=kubelet", "value": 23456 }
    ],
    "labelValueCountByLabelName": [
      { "name": "instance", "value": 500 }
    ]
  }
}
```

### 6.2 Snapshots

#### GET `/snapshot/create`

Creates an instant snapshot for backups.

```json
{
  "status": "ok",
  "snapshot": "20260219093000-14A3B2C1D0E5F678"
}
```

#### GET `/snapshot/list`

Lists all existing snapshots.

```json
{
  "status": "ok",
  "snapshots": [
    "20260219093000-14A3B2C1D0E5F678",
    "20260218120000-98765432ABCDEF01"
  ]
}
```

#### GET `/snapshot/delete?snapshot=<n>`

Deletes a specific snapshot.

```json
{
  "status": "ok"
}
```

#### GET `/snapshot/delete_all`

Deletes all snapshots.

```json
{
  "status": "ok"
}
```

### 6.3 Export

#### POST `/api/v1/export`

Exports raw samples in JSON line format (one JSON object per line).

Query params: `match[]` (required series selector), `start`, `end`, `max_rows_per_line`

Response (JSON lines, one per series):

```json
{"metric":{"__name__":"up","job":"prometheus","instance":"localhost:9090"},"values":[1,1,1],"timestamps":[1700000000000,1700000015000,1700000030000]}
{"metric":{"__name__":"up","job":"node","instance":"localhost:9100"},"values":[1,1,0],"timestamps":[1700000000000,1700000015000,1700000030000]}
```

#### POST `/api/v1/export/csv`

Exports in CSV format.

Query params: `format` (required, e.g. `__name__,__value__,__timestamp__:unix_s`), `match[]`, `start`, `end`

Response:

```csv
up,1,1700000000
up,1,1700000015
```

#### POST `/api/v1/export/native`

Exports in VictoriaMetrics native binary format (most efficient for VM-to-VM migration).

Query params: `match[]`, `start`, `end`

Response: Binary stream.

### 6.4 Import

#### POST `/api/v1/import`

Imports JSON line format data (inverse of `/api/v1/export`).

Request body: JSON lines.

#### POST `/api/v1/import/csv`

Imports CSV data.

Query params: `format` (required, e.g. `2:metric:cpu,3:label:host,4:time:unix_s`)

#### POST `/api/v1/import/native`

Imports native binary format (inverse of `/api/v1/export/native`).

#### POST `/api/v1/import/prometheus`

Imports Prometheus text exposition format.

Request body:

```
metric_name{label="value"} 123 1700000000000
```

### 6.5 Admin Operations

#### GET `/internal/force_merge?partition_prefix=YYYY_MM`

Triggers forced compaction on specified per-month partition. Returns immediately; merge runs in background.

Response: HTTP 200 with empty body.

**Warning in UI:** “Forced merges consume additional CPU, disk IO, and storage space. Only use to reclaim space after deleting series.”

#### GET `/internal/resetRollupResultCache`

Resets the response cache for previously served queries. Useful after backfilling.

Response: HTTP 200 with empty body.

#### POST `/api/v1/admin/tsdb/delete_series?match[]=<selector>`

Deletes time series matching the selector. Same as Prometheus admin API but always enabled in VM (no `--web.enable-admin-api` flag needed).

Response: HTTP 204 No Content.

### 6.6 Health Check

#### GET `/-/healthy`

Returns `VictoriaMetrics is Healthy` with HTTP 200.

#### GET `/-/ready`

Returns `VictoriaMetrics is Ready` with HTTP 200.

### 6.7 InfluxDB-Compatible Write

#### POST `/influx/write`

Accepts InfluxDB line protocol. This means the existing InfluxDB Write Data page could work for VM too (with the URL adjusted to `/influx/write`).

Query params: `db` (optional, stored as label), `precision` (ns/us/ms/s)

-----

## 7. New UI Pages (VM-Exclusive)

### 7.1 VmActiveQueries (`pages/victoriametrics/VmActiveQueries.tsx`)

Combines active queries and top queries into one page.

```
┌─────────────────────────────────────────────────────────────────┐
│  Active & Top Queries                          [↻ Auto-refresh] │
│                                                                 │
│  ┌─ ACTIVE QUERIES (live) ──────────────────────────────────┐   │
│  │                                                          │   │
│  │  Query                              Duration  Client     │   │
│  │  ─────────────────────────────────  ────────  ────────── │   │
│  │  rate(http_requests_total[5m])      0.52s     10.0.1.5   │   │
│  │  sum(up) by (job)                   0.03s     10.0.1.12  │   │
│  │  histogram_quantile(0.99, ...)      2.10s     10.0.1.5   │   │
│  │                                                          │   │
│  │  3 queries currently executing                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─ TOP QUERIES ────────────────────────────────────────────┐   │
│  │                                                          │   │
│  │  Top N: [20 ▼]    Max Lifetime: [30m ▼]                  │   │
│  │                                                          │   │
│  │  [By Count] [By Avg Duration] [By Total Duration]        │   │
│  │                                                          │   │
│  │  #  Query                            Count  Avg     Sum  │   │
│  │  ─  ──────────────────────────────  ─────  ──────  ───── │   │
│  │  1  up                              12345  0.01s   123s  │   │
│  │  2  rate(http_requests_total[5m])    5678   0.05s   284s  │   │
│  │  3  node_memory_MemAvailable_bytes  3456   0.02s   69s   │   │
│  │                                                          │   │
│  │  [Copy Query] on row hover                               │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**API calls:**

- Active: `GET /api/v1/status/active_queries`
- Top: `GET /api/v1/status/top_queries?topN=20&maxLifetime=30m`
- Auto-refresh: poll active queries every 2 seconds

**Actions per query row:**

- Click → copies query to clipboard
- “Run in Explorer” → navigates to Query Explorer with query pre-filled

### 7.2 VmTSDB (`pages/victoriametrics/VmTSDB.tsx`)

Enhanced cardinality explorer. Extends the reused Prometheus TSDB page with VM-exclusive features.

```
┌─────────────────────────────────────────────────────────────────┐
│  TSDB Status & Cardinality Explorer                             │
│                                                                 │
│  Total Series: 147,523 (+2,323 vs yesterday)   Series Count: ▲  │
│                                                                 │
│  ┌─ FILTERS ────────────────────────────────────────────────┐   │
│  │  Date: [2026-02-19 ▼]  Top N: [10 ▼]                    │   │
│  │  Focus Label: [instance      ▼]                          │   │
│  │  Match Filter: [                                    ]    │   │
│  │                                        [Apply Filters]   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─ TOP METRICS BY SERIES COUNT ────────────────────────────┐   │
│  │  kube_pod_info                                   12,345  │   │
│  │  ████████████████████████████████████████████             │   │
│  │  container_cpu_usage_seconds_total                8,901  │   │
│  │  ██████████████████████████████                           │   │
│  │  node_filesystem_size_bytes                       5,432  │   │
│  │  ██████████████████                                       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─ TOP LABELS BY SERIES COUNT ─────┐  ┌─ TOP LABEL PAIRS ──┐  │
│  │  __name__        147,523         │  │  job=kubelet  23456 │  │
│  │  instance         89,000         │  │  job=node      8901 │  │
│  │  job              72,000         │  │  ns=default    6789 │  │
│  └──────────────────────────────────┘  └─────────────────────┘  │
│                                                                 │
│  ┌─ FOCUS LABEL VALUES (instance) ──────────────────────────┐   │
│  │  prod-cluster-1:9090                             45,000  │   │
│  │  prod-cluster-2:9090                             32,000  │   │
│  │  staging-1:9090                                  12,000  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─ RUNTIME INFO ───────────────────────────────────────────┐   │
│  │  Version: v1.107.0  Uptime: 45d 3h 22m                  │   │
│  │  Storage: 128 GB    Retention: 90d                       │   │
│  │  Go Version: go1.22.5  OS: linux/amd64                   │   │
│  │  Startup Flags: -retentionPeriod=90d -memory...          │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**API calls:**

- `GET /api/v1/status/tsdb?topN=10&date=20260219&focusLabel=instance`
- `GET /api/v1/series/count`
- `GET /api/v1/status/runtimeinfo` (Prometheus-compat, works on VM)
- `GET /api/v1/status/buildinfo`
- `GET /api/v1/status/flags`

**Key difference from PromTSDB:** The `focusLabel` dropdown and `date` picker are VM-exclusive features. The bar charts for cardinality visualization are shared components.

### 7.3 VmSnapshots (`pages/victoriametrics/VmSnapshots.tsx`)

Backup snapshot management.

```
┌─────────────────────────────────────────────────────────────────┐
│  Snapshots                                                      │
│                                                                 │
│  [+ Create Snapshot]                                            │
│                                                                 │
│  ┌─ EXISTING SNAPSHOTS ─────────────────────────────────────┐   │
│  │                                                          │   │
│  │  Name                                     Created   Size │   │
│  │  ─────────────────────────────────────────────────  ───── │   │
│  │  20260219093000-14A3B2C1D0E5F678          Today     -    │   │
│  │    Path: <storageDataPath>/snapshots/2026...              │   │
│  │    [Delete]                                               │   │
│  │                                                          │   │
│  │  20260218120000-98765432ABCDEF01          Yesterday  -   │   │
│  │    Path: <storageDataPath>/snapshots/2026...              │   │
│  │    [Delete]                                               │   │
│  │                                                          │   │
│  │  [Delete All Snapshots]                                  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Info: Snapshots are created in <storageDataPath>/snapshots/.   │
│  Use vmbackup to archive snapshots to S3/GCS.                   │
│  Snapshots must be deleted via this API, not rm -rf.            │
└─────────────────────────────────────────────────────────────────┘
```

**API calls:**

- List: `GET /snapshot/list`
- Create: `GET /snapshot/create`
- Delete one: `GET /snapshot/delete?snapshot=<n>`
- Delete all: `GET /snapshot/delete_all`

**Safety:** Create/delete buttons require confirmation dialog. Hidden in `--readonly` mode.

### 7.4 VmExportImport (`pages/victoriametrics/VmExportImport.tsx`)

Data migration tool for exporting and importing time series.

```
┌─────────────────────────────────────────────────────────────────┐
│  Export / Import                                                │
│                                                                 │
│  [Export] [Import]                                              │
│                                                                 │
│  === EXPORT ════════════════════════════════════════════════════ │
│                                                                 │
│  Match Selector:  [{__name__=~"vm_.*"}                    ]     │
│  Time Range:      [2026-02-18 00:00] to [2026-02-19 00:00]     │
│  Format:          [JSON ▼]  (JSON | CSV | Native)               │
│                                                                 │
│  CSV Format String (if CSV):                                    │
│  [__name__,__value__,__timestamp__:unix_s            ]          │
│                                                                 │
│  [Preview (first 100 rows)]    [Download Export]                │
│                                                                 │
│  ┌─ PREVIEW ────────────────────────────────────────────────┐   │
│  │  {"metric":{"__name__":"vm_rows_inserted_total",...},... │   │
│  │  {"metric":{"__name__":"vm_http_requests_total",...},... │   │
│  │  ...                                                     │   │
│  │  Showing 100 of ~12,345 series                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  === IMPORT ════════════════════════════════════════════════════ │
│                                                                 │
│  Format:  [JSON ▼]  (JSON | CSV | Native | Prometheus Text)    │
│                                                                 │
│  [Choose File...]  or paste data below:                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  metric_name{label="value"} 123 1700000000000            │   │
│  │                                                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [Import Data]                                                  │
│                                                                 │
│  Warning: Import is disabled in read-only mode.                 │
└─────────────────────────────────────────────────────────────────┘
```

**API calls:**

- Export JSON: `POST /api/v1/export` with `match[]`, `start`, `end`
- Export CSV: `POST /api/v1/export/csv` with `format`, `match[]`, `start`, `end`
- Export Native: `POST /api/v1/export/native` with `match[]`, `start`, `end`
- Import JSON: `POST /api/v1/import` with JSON lines body
- Import CSV: `POST /api/v1/import/csv?format=...` with CSV body
- Import Native: `POST /api/v1/import/native` with binary body
- Import Prometheus: `POST /api/v1/import/prometheus` with text body

**Import hidden in `--readonly` mode.**

### 7.5 VmAdmin (`pages/victoriametrics/VmAdmin.tsx`)

Administrative operations dashboard.

```
┌─────────────────────────────────────────────────────────────────┐
│  Admin Operations                                               │
│                                                                 │
│  ┌─ SERIES MANAGEMENT ──────────────────────────────────────┐   │
│  │                                                          │   │
│  │  Total Series: 147,523                                   │   │
│  │                                                          │   │
│  │  Delete Series Matching:                                 │   │
│  │  [{__name__="old_metric_name"}                      ]    │   │
│  │                                                          │   │
│  │  Preview matching series before deleting:                │   │
│  │  [Preview (dry run)]                                     │   │
│  │                                                          │   │
│  │  Found 234 series matching selector.                     │   │
│  │  [Delete Series]  <- requires confirmation dialog        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─ FORCE MERGE ────────────────────────────────────────────┐   │
│  │                                                          │   │
│  │  Partition: [2026_01 ▼]  (YYYY_MM format)                │   │
│  │                                                          │   │
│  │  Warning: Force merge consumes additional CPU, disk IO,  │   │
│  │  and storage space. Only use to reclaim space after       │   │
│  │  deleting series from old partitions.                    │   │
│  │                                                          │   │
│  │  [Trigger Force Merge]  <- requires confirmation         │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─ CACHE MANAGEMENT ───────────────────────────────────────┐   │
│  │                                                          │   │
│  │  [Reset Rollup Result Cache]                             │   │
│  │                                                          │   │
│  │  Info: Recommended after backfilling data. Resets the     │   │
│  │  query response cache so new data is reflected.          │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**API calls:**

- Series count: `GET /api/v1/series/count`
- Preview: `GET /api/v1/series?match[]=<selector>` (shows list)
- Delete: `POST /api/v1/admin/tsdb/delete_series?match[]=<selector>`
- Force merge: `GET /internal/force_merge?partition_prefix=2026_01`
- Cache reset: `GET /internal/resetRollupResultCache`

**Entire page hidden in `--readonly` mode.**

-----

## 8. Reused Pages (from Prometheus)

These existing Prometheus pages work against VictoriaMetrics with zero or minimal changes:

|Page             |Component                 |VM API Endpoint                       |Notes                                                                                                                                             |
|-----------------|--------------------------|--------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------|
|Query Explorer   |`PromQueryExplorer.tsx`   |`/api/v1/query`, `/api/v1/query_range`|MetricsQL is superset of PromQL. Consider adding “MetricsQL” label in header when connected to VM.                                                |
|Targets          |`PromTargets.tsx`         |`/api/v1/targets`                     |Only if VM is configured with `-promscrape.config`. May return empty if VM is only used as remote storage. Show info message if targets are empty.|
|Alert Rules      |`PromAlertRules.tsx`      |`/api/v1/rules`                       |Only if vmalert is connected. May be empty.                                                                                                       |
|Alertmanager     |`PromAlertmanager.tsx`    |Alertmanager v2 API                   |Same as Prometheus — uses separate alertmanagerUrl.                                                                                               |
|Metric Explorer  |`PromMetrics.tsx`         |`/api/v1/metadata`, `/api/v1/labels`  |Works identically.                                                                                                                                |
|Config           |`PromConfig.tsx`          |`/api/v1/status/config`               |Shows VM config flags instead of prometheus.yml.                                                                                                  |
|Service Discovery|`PromServiceDiscovery.tsx`|`/api/v1/targets`                     |Same caveats as Targets page.                                                                                                                     |

### Minor modifications for reuse

1. **Query Explorer header:** Show “MetricsQL” instead of “PromQL” when `connection.type === 'victoriametrics'`.
1. **Targets page empty state:** Show “VictoriaMetrics is not configured for scraping. Targets are only available when -promscrape.config is set.” instead of generic “No targets found.”
1. **Config page:** Label as “Runtime Flags” instead of “Configuration File” for VM connections, since VM shows flags rather than YAML.

These are conditional text changes, not new components:

```typescript
// Example: in PromQueryExplorer.tsx
const queryLanguage = activeConnection?.type === 'victoriametrics' ? 'MetricsQL' : 'PromQL';
```

-----

## 9. Implementation Phases

### Phase 1: Foundation (1-2 hours)

1. **Connection model:** Add `'victoriametrics'` to the connection type union type.
1. **Connection dialog:** Add VictoriaMetrics option with cluster mode toggle.
1. **CLI flags:** Add `--vm-url`, `--vm-user`, `--vm-password`, `--vm-name`, `--vm-tenant` to `main.go`.
1. **Sidebar:** Add VictoriaMetrics menu that renders when VM connection is active.
1. **Router:** Add `/ui/victoriametrics/*` routes.
1. **Health check:** Implement `/-/healthy` check for Test Connection button.
1. **API client:** Create `api/victoriametrics.ts` with helper functions for VM-exclusive endpoints.

### Phase 2: Reused Pages (30 min)

1. **Wire Prometheus pages into VM routes.** When a VM connection is active, render the Prometheus components at the VM route paths.
1. **Add conditional labels** (MetricsQL, Runtime Flags, empty state messages).
1. **Test** all reused pages against a running VictoriaMetrics instance.

### Phase 3: VM-Exclusive Pages (3-4 hours)

Build in this order (each page is independent):

1. **VmTSDB** — Enhanced cardinality explorer (highest value, most complex)
1. **VmActiveQueries** — Active + top queries (high visibility)
1. **VmSnapshots** — Snapshot management (straightforward CRUD)
1. **VmExportImport** — Export/import tool (file handling complexity)
1. **VmAdmin** — Admin operations (simple but needs safety guards)

### Phase 4: Polish (1-2 hours)

1. **Cluster mode support** — tenant ID URL path prefixing, vminsert routing for writes.
1. **Connections file** — add `victoriametrics` type to JSON schema.
1. **`--readonly` enforcement** — hide write/admin pages and buttons.
1. **Error handling** — friendly messages when VM doesn’t support an endpoint (e.g., targets when not scraping).
1. **README update** — add VM section to Features and Compatibility.

-----

## 10. Docker Testing Environment

### Single-node VictoriaMetrics

```bash
docker run -d \
  --name victoriametrics \
  -p 8428:8428 \
  -v vmdata:/victoria-metrics-data \
  victoriametrics/victoria-metrics:latest \
  -retentionPeriod=12 \
  -selfScrapeInterval=5s \
  -search.latencyBudget=0s
```

The `-selfScrapeInterval=5s` flag makes VM scrape its own metrics, so you immediately have data to query.

### Write sample data

```bash
# Import via Prometheus text format
curl -d 'cpu_usage{host="server1",region="us-east"} 72.5' \
  http://localhost:8428/api/v1/import/prometheus

curl -d 'cpu_usage{host="server2",region="eu-west"} 45.3' \
  http://localhost:8428/api/v1/import/prometheus

curl -d 'memory_used_bytes{host="server1",region="us-east"} 4294967296' \
  http://localhost:8428/api/v1/import/prometheus

# Import via InfluxDB line protocol
curl -d 'disk_usage,host=server1,region=us-east value=82.1' \
  http://localhost:8428/influx/write
```

### Full test stack

```bash
# VictoriaMetrics + Prometheus + InfluxDB + Alertmanager
docker run -d --name victoriametrics -p 8428:8428 \
  victoriametrics/victoria-metrics:latest -selfScrapeInterval=5s

docker run -d --name prometheus -p 9090:9090 prom/prometheus

docker run -d --name alertmanager -p 9093:9093 prom/alertmanager

docker run -d --name influxdb -p 8086:8086 influxdb:1.12

# Start TimeseriesUI with all backends
./timeseriesui \
  --influxdb-url http://localhost:8086 \
  --prometheus-url http://localhost:9090 \
  --vm-url http://localhost:8428 \
  --alertmanager-url http://localhost:9093
```

### Verify VM-exclusive endpoints

```bash
# Health
curl http://localhost:8428/-/healthy

# Series count
curl http://localhost:8428/api/v1/series/count

# TSDB status with enhanced params
curl 'http://localhost:8428/api/v1/status/tsdb?topN=5&focusLabel=job'

# Top queries
curl 'http://localhost:8428/api/v1/status/top_queries?topN=5'

# Active queries
curl http://localhost:8428/api/v1/status/active_queries

# Create snapshot
curl http://localhost:8428/snapshot/create

# List snapshots
curl http://localhost:8428/snapshot/list

# Export
curl -d 'match[]={__name__!=""}' http://localhost:8428/api/v1/export

# Cache reset
curl http://localhost:8428/internal/resetRollupResultCache
```

### VictoriaMetrics Cluster (optional, for testing multi-tenant)

```bash
# Clone and start cluster
git clone https://github.com/VictoriaMetrics/VictoriaMetrics && cd VictoriaMetrics
make docker-vm-cluster-up

# This starts:
# - vminsert on :8480
# - vmselect on :8481
# - vmstorage on :8482

# Write to tenant 0:0
curl -d 'test_metric{job="test"} 42' \
  http://localhost:8480/insert/0/prometheus/api/v1/import/prometheus

# Query from tenant 0:0
curl 'http://localhost:8481/select/0/prometheus/api/v1/query?query=test_metric'

# List tenants
curl http://localhost:8481/admin/tenants
```

-----

## 11. File Structure

New and modified files:

```
ui/src/
├── api/
│   ├── influxdb.ts           # Existing
│   ├── prometheus.ts         # Existing
│   └── victoriametrics.ts    # NEW — VM-exclusive API client
├── components/
│   ├── Layout.tsx            # MODIFIED — add VM menu items to sidebar
│   └── ConnectionManager.tsx # MODIFIED — add VM connection type + dialog
├── pages/
│   ├── QueryExplorer.tsx     # Existing (InfluxDB)
│   ├── DatabaseAdmin.tsx     # Existing (InfluxDB)
│   ├── WriteData.tsx         # Existing (InfluxDB)
│   ├── SystemHealth.tsx      # Existing (InfluxDB)
│   ├── prometheus/           # Existing
│   │   ├── PromQueryExplorer.tsx   # MINOR EDIT — MetricsQL label
│   │   ├── PromTargets.tsx         # MINOR EDIT — empty state message
│   │   ├── PromAlertRules.tsx      # No change
│   │   ├── PromAlertmanager.tsx    # No change
│   │   ├── PromTSDB.tsx            # No change (VM has own enhanced page)
│   │   ├── PromMetrics.tsx         # No change
│   │   ├── PromConfig.tsx          # MINOR EDIT — "Runtime Flags" label
│   │   └── PromServiceDiscovery.tsx # No change
│   └── victoriametrics/     # NEW directory
│       ├── VmTSDB.tsx              # Enhanced cardinality explorer
│       ├── VmActiveQueries.tsx     # Active + top queries
│       ├── VmSnapshots.tsx         # Snapshot management
│       ├── VmExportImport.tsx      # Data migration
│       └── VmAdmin.tsx             # Force merge, cache, delete
├── hooks/
│   └── useVmApi.ts           # NEW — React hooks for VM API calls
└── App.tsx                   # MODIFIED — add VM routes

main.go                       # MODIFIED — add --vm-* CLI flags
README.md                     # MODIFIED — add VM section
```

### New API Client (`api/victoriametrics.ts`)

```typescript
// VM-exclusive endpoint helpers
// All Prometheus-compatible endpoints use the existing prometheus.ts client

export async function getActiveQueries(proxyBase: string, target: string): Promise<ActiveQuery[]> {
  const resp = await fetch(
    `${proxyBase}?target=${encodeURIComponent(target)}&path=/api/v1/status/active_queries`
  );
  const data = await resp.json();
  return data.data;
}

export async function getTopQueries(
  proxyBase: string, target: string, topN = 20, maxLifetime = '30m'
): Promise<TopQueries> {
  const resp = await fetch(
    `${proxyBase}?target=${encodeURIComponent(target)}&path=/api/v1/status/top_queries&topN=${topN}&maxLifetime=${maxLifetime}`
  );
  const data = await resp.json();
  return data.data;
}

export async function getSeriesCount(proxyBase: string, target: string): Promise<number> {
  const resp = await fetch(
    `${proxyBase}?target=${encodeURIComponent(target)}&path=/api/v1/series/count`
  );
  const data = await resp.json();
  return data.data[0];
}

export async function getTsdbStatusEnhanced(
  proxyBase: string, target: string,
  opts: { topN?: number; focusLabel?: string; date?: string; match?: string }
): Promise<TsdbStatus> {
  const params = new URLSearchParams();
  if (opts.topN) params.set('topN', String(opts.topN));
  if (opts.focusLabel) params.set('focusLabel', opts.focusLabel);
  if (opts.date) params.set('date', opts.date);
  if (opts.match) params.set('match[]', opts.match);
  const resp = await fetch(
    `${proxyBase}?target=${encodeURIComponent(target)}&path=/api/v1/status/tsdb&${params}`
  );
  const data = await resp.json();
  return data.data;
}

export async function listSnapshots(proxyBase: string, target: string): Promise<string[]> {
  const resp = await fetch(
    `${proxyBase}?target=${encodeURIComponent(target)}&path=/snapshot/list`
  );
  const data = await resp.json();
  return data.snapshots || [];
}

export async function createSnapshot(proxyBase: string, target: string): Promise<string> {
  const resp = await fetch(
    `${proxyBase}?target=${encodeURIComponent(target)}&path=/snapshot/create`
  );
  const data = await resp.json();
  return data.snapshot;
}

export async function deleteSnapshot(
  proxyBase: string, target: string, name: string
): Promise<void> {
  await fetch(
    `${proxyBase}?target=${encodeURIComponent(target)}&path=/snapshot/delete&snapshot=${encodeURIComponent(name)}`
  );
}

export async function forceMerge(
  proxyBase: string, target: string, partition: string
): Promise<void> {
  await fetch(
    `${proxyBase}?target=${encodeURIComponent(target)}&path=/internal/force_merge&partition_prefix=${encodeURIComponent(partition)}`
  );
}

export async function resetCache(proxyBase: string, target: string): Promise<void> {
  await fetch(
    `${proxyBase}?target=${encodeURIComponent(target)}&path=/internal/resetRollupResultCache`
  );
}

export async function exportData(
  proxyBase: string, target: string,
  opts: { match: string; start?: string; end?: string; format: 'json' | 'csv' | 'native'; csvFormat?: string }
): Promise<Response> {
  const path = opts.format === 'csv' ? '/api/v1/export/csv'
    : opts.format === 'native' ? '/api/v1/export/native'
    : '/api/v1/export';
  const params = new URLSearchParams({ 'match[]': opts.match });
  if (opts.start) params.set('start', opts.start);
  if (opts.end) params.set('end', opts.end);
  if (opts.csvFormat) params.set('format', opts.csvFormat);
  return fetch(
    `${proxyBase}?target=${encodeURIComponent(target)}&path=${path}&${params}`
  );
}

export async function importData(
  proxyBase: string, target: string,
  opts: { format: 'json' | 'csv' | 'native' | 'prometheus'; body: string | Blob; csvFormat?: string }
): Promise<void> {
  const pathMap = {
    json: '/api/v1/import',
    csv: '/api/v1/import/csv',
    native: '/api/v1/import/native',
    prometheus: '/api/v1/import/prometheus',
  };
  let path = pathMap[opts.format];
  if (opts.csvFormat) path += `?format=${encodeURIComponent(opts.csvFormat)}`;
  await fetch(
    `${proxyBase}?target=${encodeURIComponent(target)}&path=${path}`,
    { method: 'POST', body: opts.body }
  );
}

export async function deleteSeries(
  proxyBase: string, target: string, match: string
): Promise<void> {
  await fetch(
    `${proxyBase}?target=${encodeURIComponent(target)}&path=/api/v1/admin/tsdb/delete_series&match[]=${encodeURIComponent(match)}`,
    { method: 'POST' }
  );
}
```

-----

## README Updates

Add to the Features section:

```markdown
### VictoriaMetrics

* **MetricsQL Query Explorer** — full MetricsQL support (superset of PromQL)
* **Enhanced Cardinality Explorer** — top metrics/labels with focus label, date filtering, match selectors
* **Active & Top Queries** — monitor running queries and identify slowest/most frequent
* **Snapshot Management** — create, list, and delete instant backups
* **Data Export/Import** — migrate data in JSON, CSV, native binary, or Prometheus text format
* **Admin Operations** — force merge partitions, reset query cache, delete series
* **Cluster Support** — multi-tenant queries via accountID:projectID
```

Add to the Compatibility section:

```markdown
### VictoriaMetrics

Works with VictoriaMetrics single-node and cluster:

* VictoriaMetrics single-node (all features)
* VictoriaMetrics cluster (vmselect for queries, vminsert for writes)
* Uses Prometheus-compatible API for shared features
* VM-exclusive features require VictoriaMetrics v1.90+
```

Update Quick Start:

```markdown
# Quick start with VictoriaMetrics
./timeseriesui --vm-url http://localhost:8428

# All three backends
./timeseriesui \
  --influxdb-url http://localhost:8086 \
  --prometheus-url http://localhost:9090 \
  --vm-url http://localhost:8428
```

-----

*End of spec. This document provides everything needed for Claude Code to implement VictoriaMetrics support in TimeseriesUI.*