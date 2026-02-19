# TimeseriesUI — Multi-Backend Implementation Spec

## For: Claude Code / AI-assisted development

## Project: https://github.com/arunslalgit/TideDB/tree/claude/timeseries-ui-Vcffr

## Goal: Extend TimeseriesUI from InfluxDB-only to a unified time-series UI supporting InfluxDB + Prometheus (and future backends)

-----

## 1. CURRENT STATE

### Repository Structure

```
timeseriesui/
├── main.go          # Go HTTP server — proxies API, embeds UI via go:embed
├── go.mod           # No external Go dependencies (stdlib only)
├── ui/
│   ├── src/         # React + TypeScript source
│   └── dist/        # Built assets (embedded into the binary at build time)
├── bin/             # Pre-built binaries
├── LICENSE          # Apache 2.0
├── NOTICE
└── README.md
```

### Current Capabilities (InfluxDB only)

- Multi-connection — manage multiple InfluxDB instances from sidebar
- Query Explorer — InfluxQL editor with syntax highlighting, schema tree, table & chart
- Database Admin — create/drop databases, retention policies, continuous queries, users
- Write Data — paste or upload line protocol
- System Health — live diagnostics, stats, active queries (with kill), shard groups
- Zero server-side state — connections stored in browser localStorage; binary is stateless

### Key Design Principles (MUST preserve)

- **Single binary** — Go embeds all UI assets via `embed` package
- **Zero Go dependencies** — stdlib `net/http` only, no external modules
- **Stateless server** — all user state lives in browser localStorage
- **Proxy architecture** — Go server proxies API calls to backends, solving CORS

-----

## 2. TARGET STATE

### Vision

One unified time-series UI binary that supports multiple backend types. Users add connections of different types (InfluxDB, Prometheus, etc.) and get backend-specific UI pages for each. Shared components (charts, tables, connection manager) are reused across backends.

### Product Name

Keep as **TimeseriesUI** (already generic enough). The binary name stays `timeseriesui`.

-----

## 3. CLI INTERFACE (Rich Command-Line Invocation)

### Current CLI

```
timeseriesui [flags]
  --influxdb-url string   Default InfluxDB URL
  --port int              Port to listen on (default 8080)
```

### New CLI — Full Specification

```
timeseriesui [flags]

SERVER FLAGS:
  --port int                    Port to listen on (default 8080)
  --host string                 Host/IP to bind to (default "0.0.0.0")
  --base-path string            Base URL path prefix, e.g. /tsui (default "/")
  --tls-cert string             Path to TLS certificate file (enables HTTPS)
  --tls-key string              Path to TLS private key file

CONNECTION FLAGS (shortcuts to pre-configure default connections):
  --influxdb-url string         Add a default InfluxDB connection
                                Example: --influxdb-url http://localhost:8086
  --influxdb-url string         Can be repeated for multiple instances
                                Example: --influxdb-url http://prod:8086 --influxdb-url http://staging:8086
  --influxdb-user string        Default InfluxDB username (applies to all --influxdb-url)
  --influxdb-password string    Default InfluxDB password
  --influxdb-name string        Display name for the InfluxDB connection (default: auto from URL)

  --prometheus-url string       Add a default Prometheus connection
                                Example: --prometheus-url http://localhost:9090
  --prometheus-url string       Can be repeated for multiple instances
                                Example: --prometheus-url http://prod-prom:9090 --prometheus-url http://staging-prom:9090
  --prometheus-name string      Display name for the Prometheus connection (default: auto from URL)
  --prometheus-user string      Default Prometheus basic-auth username
  --prometheus-password string  Default Prometheus basic-auth password

  --alertmanager-url string     Add a default Alertmanager connection (linked to Prometheus)
                                Example: --alertmanager-url http://localhost:9093

MULTI-CONNECTION SHORTHAND:
  --connections string          Path to a JSON/YAML connections file
                                Example: --connections ./connections.json

LOGGING & DEBUG:
  --log-level string            Log verbosity: debug, info, warn, error (default "info")
  --log-format string           Log format: text, json (default "text")
  --proxy-timeout duration      Timeout for proxied API requests (default 30s)
  --max-response-size string    Max proxied response size (default "50MB")

FEATURE FLAGS:
  --disable-write               Disable the Write Data feature (read-only mode)
  --disable-admin               Disable admin/destructive operations (drop DB, kill query)
  --readonly                    Shorthand for --disable-write --disable-admin

META:
  --version                     Print version and exit
  --help                        Print help and exit
```

### Connections File Format (–connections)

```json
{
  "connections": [
    {
      "name": "Production InfluxDB",
      "type": "influxdb",
      "url": "https://influx-prod.example.com:8086",
      "username": "admin",
      "password": "secret",
      "defaultDatabase": "telegraf"
    },
    {
      "name": "Staging InfluxDB",
      "type": "influxdb",
      "url": "http://influx-staging:8086"
    },
    {
      "name": "Production Prometheus",
      "type": "prometheus",
      "url": "http://prometheus-prod:9090",
      "alertmanagerUrl": "http://alertmanager-prod:9093"
    },
    {
      "name": "Dev Prometheus",
      "type": "prometheus",
      "url": "http://prometheus-dev:9090"
    }
  ]
}
```

### CLI Usage Examples

```bash
# Simplest — start empty, add connections in browser
./timeseriesui

# Quick start with one InfluxDB
./timeseriesui --influxdb-url http://localhost:8086

# Quick start with one Prometheus
./timeseriesui --prometheus-url http://localhost:9090

# Both backends at once
./timeseriesui \
  --influxdb-url http://localhost:8086 \
  --prometheus-url http://localhost:9090

# Multiple Prometheus instances
./timeseriesui \
  --prometheus-url http://prom-prod:9090 \
  --prometheus-url http://prom-staging:9090 \
  --prometheus-url http://prom-dev:9090

# Production setup: HTTPS, read-only, multiple backends
./timeseriesui \
  --port 443 \
  --tls-cert /etc/ssl/cert.pem \
  --tls-key /etc/ssl/key.pem \
  --readonly \
  --connections /etc/timeseriesui/connections.json

# Behind a reverse proxy at /tsui/
./timeseriesui --base-path /tsui --port 3000

# With Alertmanager
./timeseriesui \
  --prometheus-url http://prometheus:9090 \
  --alertmanager-url http://alertmanager:9093
```

-----

## 4. GO SERVER CHANGES (main.go)

### 4.1 Route Architecture

```
HTTP Routes:
  /                           → Serve embedded React SPA
  /ui/*                       → Serve embedded React SPA (existing)
  /api/v1/connections         → GET: return CLI-provided default connections as JSON
  /api/v1/health              → GET: server health check

  /proxy/influxdb/*           → Reverse proxy to InfluxDB URL
    Client sends: POST /proxy/influxdb/?target=http://myinflux:8086&path=/query&db=mydb&q=SHOW+DATABASES
    Server proxies to: http://myinflux:8086/query?db=mydb&q=SHOW+DATABASES

  /proxy/prometheus/*         → Reverse proxy to Prometheus URL
    Client sends: GET /proxy/prometheus/?target=http://myprom:9090&path=/api/v1/query&query=up
    Server proxies to: http://myprom:9090/api/v1/query?query=up

  /proxy/alertmanager/*       → Reverse proxy to Alertmanager URL
    Client sends: GET /proxy/alertmanager/?target=http://myam:9093&path=/api/v2/alerts
    Server proxies to: http://myam:9093/api/v2/alerts
```

### 4.2 Proxy Handler (Generic)

The proxy should be **generic** — one handler that:

1. Reads `target` query param (the backend URL)
1. Reads `path` query param (the API path to call on the backend)
1. Forwards all other query params, headers, and body
1. Returns the response with proper CORS headers

This means the Go server does NOT need to know about InfluxDB or Prometheus APIs specifically. It’s a dumb proxy. The React frontend constructs the right API calls.

```go
// Pseudocode for the proxy handler
func proxyHandler(w http.ResponseWriter, r *http.Request) {
    target := r.URL.Query().Get("target")    // e.g. http://prometheus:9090
    apiPath := r.URL.Query().Get("path")     // e.g. /api/v1/query

    // Build destination URL
    destURL := target + apiPath

    // Copy remaining query params (exclude target and path)
    params := r.URL.Query()
    params.Del("target")
    params.Del("path")
    destURL += "?" + params.Encode()

    // Create proxy request with same method, headers, body
    proxyReq, _ := http.NewRequest(r.Method, destURL, r.Body)
    // Copy relevant headers (Authorization, Content-Type, etc.)

    // Execute and stream response back
    resp, err := httpClient.Do(proxyReq)
    // Copy response status, headers, body back to w
}
```

### 4.3 Default Connections Endpoint

```go
// GET /api/v1/connections returns CLI-configured connections
// The frontend merges these with localStorage connections
// CLI connections are marked as "source": "cli" and cannot be deleted in the UI
func connectionsHandler(w http.ResponseWriter, r *http.Request) {
    json.NewEncoder(w).Encode(cliConnections)
}
```

### 4.4 Security Considerations

- The proxy must validate that `target` URLs use http:// or https:// schemes only
- Optional: allow-list of target URLs if `--connections` file is provided
- Rate limiting on proxy requests (use –proxy-timeout)
- Strip sensitive headers from proxy responses
- Do NOT proxy to localhost/127.0.0.1 unless explicitly allowed (SSRF protection)
  - Exception: if –influxdb-url or –prometheus-url explicitly points to localhost

-----

## 5. FRONTEND ARCHITECTURE

### 5.1 Connection Model

```typescript
// types/connection.ts

type BackendType = 'influxdb' | 'prometheus';

interface BaseConnection {
  id: string;                    // UUID, auto-generated
  name: string;                  // Display name
  type: BackendType;             // Backend type
  url: string;                   // Base URL (e.g. http://prometheus:9090)
  username?: string;             // Basic auth username
  password?: string;             // Basic auth password
  source: 'browser' | 'cli';    // Where this connection came from
  color?: string;                // Optional sidebar accent color
  createdAt: string;             // ISO timestamp
  lastUsedAt?: string;           // ISO timestamp
}

interface InfluxDBConnection extends BaseConnection {
  type: 'influxdb';
  defaultDatabase?: string;      // Auto-select this DB
  version?: string;              // Detected version (1.x, 2.x)
}

interface PrometheusConnection extends BaseConnection {
  type: 'prometheus';
  alertmanagerUrl?: string;      // Linked Alertmanager URL
  alertmanagerUsername?: string;
  alertmanagerPassword?: string;
}

type Connection = InfluxDBConnection | PrometheusConnection;
```

### 5.2 localStorage Schema

```typescript
// Key: "timeseriesui_connections"
// Value: Connection[] (JSON stringified)

// Key: "timeseriesui_settings"
// Value: { theme: 'light'|'dark', defaultView: string, ... }

// Key: "timeseriesui_query_history_<connectionId>"
// Value: { query: string, timestamp: string }[]

// Key: "timeseriesui_active_connection"
// Value: string (connection ID)
```

### 5.3 React Router Structure

```
/                                    → Redirect to /ui/
/ui/                                 → Landing / connection list (if none active)

## InfluxDB Pages (existing — move under /ui/influxdb/)
/ui/influxdb/query                   → InfluxQL Query Explorer
/ui/influxdb/databases               → Database Admin
/ui/influxdb/write                   → Write Data
/ui/influxdb/health                  → System Health / Diagnostics
/ui/influxdb/users                   → User Management
/ui/influxdb/retention               → Retention Policies
/ui/influxdb/continuous-queries      → Continuous Queries

## Prometheus Pages (NEW)
/ui/prometheus/query                 → PromQL Query Explorer
/ui/prometheus/targets               → Scrape Targets
/ui/prometheus/alerts                → Alert Rules (from Prometheus)
/ui/prometheus/alertmanager          → Alertmanager (firing alerts, silences)
/ui/prometheus/tsdb                  → TSDB Status & Health
/ui/prometheus/config                → Running Config (read-only)
/ui/prometheus/flags                 → Command Flags
/ui/prometheus/metrics               → Metric Metadata Explorer
/ui/prometheus/service-discovery     → Service Discovery Status

## Shared Pages
/ui/settings                         → App settings, theme
/ui/connections                      → Connection manager (add/edit/remove)
```

### 5.4 Sidebar Navigation

```
┌──────────────────────────┐
│  🌊 TimeseriesUI         │
│                          │
│  CONNECTIONS             │
│  ┌────────────────────┐  │
│  │ 🟢 prod-influx    ▾│  │  ← Dropdown or clickable list
│  │ 🟡 staging-influx  │  │     Icon: InfluxDB logo / color
│  │ 🔴 prod-prometheus │  │     Icon: Prometheus flame / color
│  │ 🟢 dev-prometheus  │  │
│  │ + Add Connection    │  │
│  └────────────────────┘  │
│                          │
│  ── active: prod-prom ── │
│                          │
│  📊 Query Explorer       │  ← Context-aware: shows PromQL or InfluxQL
│  🎯 Targets              │  ← Only visible for Prometheus connections
│  🔔 Alerts               │  ← Only visible for Prometheus connections
│  🔕 Alertmanager         │  ← Only if alertmanagerUrl is configured
│  💾 TSDB Status           │  ← Shows for Prometheus
│  ⚙️  Config               │  ← Read-only config view
│  📋 Metrics Explorer     │  ← Prometheus metric metadata
│  🔍 Service Discovery    │  ← Prometheus SD status
│                          │
│  ── Settings ──          │
│  🎨 Theme                │
│  📡 Connections          │
│  ℹ️  About               │
└──────────────────────────┘
```

The sidebar dynamically shows/hides menu items based on the active connection’s `type`.

### 5.5 Add Connection Dialog

```
┌──────────────────────────────────────┐
│  Add Connection                      │
│                                      │
│  Connection Type:                    │
│  ┌──────────┐  ┌──────────────┐      │
│  │ InfluxDB │  │ Prometheus   │      │  ← Toggle / tabs
│  └──────────┘  └──────────────┘      │
│                                      │
│  Name:  [ My Prometheus          ]   │
│  URL:   [ http://localhost:9090  ]   │
│                                      │
│  ▸ Authentication (optional)         │
│    Username: [                    ]   │
│    Password: [                    ]   │
│                                      │
│  ▸ Alertmanager (optional)           │  ← Only for Prometheus type
│    URL: [ http://localhost:9093  ]   │
│                                      │
│  [ Test Connection ]  [ Save ]       │
└──────────────────────────────────────┘
```

**Test Connection** behavior per type:

- **InfluxDB**: `GET <url>/ping` → expect 204
- **Prometheus**: `GET <url>/api/v1/status/buildinfo` → expect JSON with `status: "success"`
- **Alertmanager**: `GET <url>/api/v2/status` → expect JSON

-----

## 6. PROMETHEUS UI PAGES — DETAILED SPECS

All Prometheus API calls go through the Go proxy:

```
Frontend calls:  /proxy/prometheus/?target=<url>&path=<api_path>&<params>
Go proxies to:   <url><api_path>?<params>
```

### 6.1 PromQL Query Explorer (`/ui/prometheus/query`)

**Prometheus API endpoints used:**

```
GET  /api/v1/query           — instant query
GET  /api/v1/query_range     — range query
GET  /api/v1/labels          — all label names
GET  /api/v1/label/<name>/values — values for a label
GET  /api/v1/series           — series matching selectors
GET  /api/v1/metadata         — metric metadata (HELP/TYPE)
```

**UI Layout:**

```
┌─────────────────────────────────────────────────────────┐
│  PromQL Query Editor (CodeMirror with PromQL mode)      │
│  ┌───────────────────────────────────────────────────┐  │
│  │ rate(http_requests_total{status="500"}[5m])       │  │
│  └───────────────────────────────────────────────────┘  │
│  [Execute] [Format] [Explain]   Time: [now-1h] to [now] │
│  Step: [auto / 15s]  Format: [Table / Graph / JSON]     │
│                                                         │
│  ┌─ Schema Explorer (left panel) ─┐ ┌─ Results ──────┐ │
│  │  🔍 Search metrics...          │ │                 │ │
│  │  📊 http_requests_total        │ │  Line chart     │ │
│  │     ├─ method: GET, POST       │ │  or data table  │ │
│  │     ├─ status: 200, 500        │ │  or raw JSON    │ │
│  │     └─ instance: ...           │ │                 │ │
│  │  📊 node_cpu_seconds_total     │ │                 │ │
│  │  📊 go_goroutines              │ │                 │ │
│  └────────────────────────────────┘ └─────────────────┘ │
│                                                         │
│  Query History: [recent queries as clickable chips]      │
└─────────────────────────────────────────────────────────┘
```

**Features:**

- PromQL syntax highlighting (use CodeMirror with `@prometheus-io/codemirror-promql` or implement basic highlighting)
- Autocomplete for metric names, label names, label values, PromQL functions
- Schema tree: list all metrics with their labels (from `/api/v1/metadata` and `/api/v1/series`)
- Click metric in tree → inserts into editor
- Time range selector: relative (last 1h, 6h, 24h, 7d) and absolute
- Results as: line chart (time series), table, raw JSON
- Query history stored in localStorage per connection

### 6.2 Targets Page (`/ui/prometheus/targets`)

**API:** `GET /api/v1/targets`

**UI Layout:**

```
┌─────────────────────────────────────────────────────────┐
│  Scrape Targets                          [Filter] [↻]   │
│                                                         │
│  Summary: 45 active │ 3 down │ 2 unknown               │
│                                                         │
│  ┌─ Job: node-exporter ──────────────────────────────┐  │
│  │  🟢 http://10.0.1.1:9100/metrics   15ms    10s ago│  │
│  │  🟢 http://10.0.1.2:9100/metrics   22ms    10s ago│  │
│  │  🔴 http://10.0.1.3:9100/metrics   ERROR   10s ago│  │
│  │     └─ "connection refused"                       │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─ Job: kube-state-metrics ─────────────────────────┐  │
│  │  🟢 http://10.0.2.1:8080/metrics   8ms     15s ago│  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  Filter by: [Job ▾] [Status: All/Up/Down ▾] [Search]   │
└─────────────────────────────────────────────────────────┘
```

**Features:**

- Group by job name
- Show: endpoint URL, scrape duration, last scrape time, status (up/down), error message
- Filter by job, status (up/down), search by URL
- Click a target → show discovered labels vs target labels
- Auto-refresh toggle (5s, 10s, 30s, off)
- Summary bar with counts

### 6.3 Alert Rules Page (`/ui/prometheus/alerts`)

**API:** `GET /api/v1/rules`

**UI Layout:**

```
┌─────────────────────────────────────────────────────────┐
│  Alert Rules                             [Filter] [↻]   │
│                                                         │
│  Summary: 12 rules │ 2 firing │ 1 pending │ 9 inactive │
│                                                         │
│  ┌─ Group: kubernetes-alerts ────────────────────────┐  │
│  │  🔴 FIRING  KubePodCrashLooping                   │  │
│  │     expr: rate(kube_pod_container_status_          │  │
│  │           restarts_total[5m]) > 0                  │  │
│  │     for: 15m │ severity: critical                  │  │
│  │     Active since: 2026-02-19T08:30:00Z             │  │
│  │     Firing instances: 3                            │  │
│  │                                                    │  │
│  │  🟡 PENDING  KubeNodeNotReady                     │  │
│  │     expr: kube_node_status_condition{...}          │  │
│  │     for: 5m │ severity: warning                    │  │
│  │                                                    │  │
│  │  ⚪ INACTIVE  KubeDeploymentReplicasMismatch      │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  Filter: [All / Firing / Pending / Inactive]            │
│  Also showing: Recording Rules [toggle]                 │
└─────────────────────────────────────────────────────────┘
```

**Features:**

- Group by rule group name
- Show state: firing (red), pending (yellow), inactive (grey)
- Show PromQL expression with syntax highlighting
- Show `for` duration, labels, annotations
- For firing alerts: show active instances with label sets
- Toggle between alerting rules and recording rules
- Click expression → opens in Query Explorer
- Filter by state, search by name

### 6.4 Alertmanager Page (`/ui/prometheus/alertmanager`)

**API (Alertmanager v2):**

```
GET  /api/v2/alerts           — current alerts
GET  /api/v2/silences         — all silences
POST /api/v2/silences         — create a silence
DELETE /api/v2/silence/<id>   — delete a silence
GET  /api/v2/status           — alertmanager status
```

**UI Layout:**

```
┌─────────────────────────────────────────────────────────┐
│  Alertmanager                                     [↻]   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                │
│  │  Alerts  │ │ Silences │ │  Status  │                │
│  └──────────┘ └──────────┘ └──────────┘                │
│                                                         │
│  ALERTS TAB:                                            │
│  🔴 [critical] KubePodCrashLooping                      │
│     instance=pod-abc, namespace=production               │
│     Started: 2h ago  │  [Silence]  [Info]               │
│                                                         │
│  SILENCES TAB:                                          │
│  🔕 Silenced: alertname=KubeNodeNotReady                │
│     By: admin │ Until: 2026-02-20 │ [Expire]            │
│  [+ New Silence]                                        │
│                                                         │
│  STATUS TAB:                                            │
│  Cluster: 3 peers │ Mesh status: Ready                  │
│  Uptime: 14d │ Version: 0.27.0                          │
└─────────────────────────────────────────────────────────┘
```

**Features:**

- View firing alerts grouped by alertname
- Create/edit/delete silences (with matcher builder)
- View Alertmanager cluster status
- Silence dialog: matcher builder (alertname =~ “…”), duration, comment

### 6.5 TSDB Status Page (`/ui/prometheus/tsdb`)

**API:**

```
GET /api/v1/status/tsdb        — TSDB stats
GET /api/v1/status/runtimeinfo — runtime info
GET /api/v1/status/buildinfo   — build/version info
GET /api/v1/status/flags       — command-line flags
```

**UI Layout:**

```
┌─────────────────────────────────────────────────────────┐
│  TSDB Status & Health                             [↻]   │
│                                                         │
│  BUILD INFO                                             │
│  Version: 3.1.0  │  Go: 1.23  │  Uptime: 14d 3h       │
│                                                         │
│  TSDB STATISTICS                                        │
│  Head Series:      1,234,567                            │
│  Head Chunks:      3,456,789                            │
│  Head Min Time:    2026-02-12T00:00:00Z                 │
│  Head Max Time:    2026-02-19T10:00:00Z                 │
│  Num Series:       2,345,678                            │
│                                                         │
│  TOP 10 — HIGHEST CARDINALITY METRICS                   │
│  ┌──────────────────────────────────┬──────────┐        │
│  │ Metric Name                      │ Series   │        │
│  ├──────────────────────────────────┼──────────┤        │
│  │ container_cpu_usage_seconds_total│ 45,231   │        │
│  │ http_requests_total              │ 23,112   │        │
│  └──────────────────────────────────┴──────────┘        │
│                                                         │
│  TOP 10 — HIGHEST CARDINALITY LABEL PAIRS               │
│  ┌──────────────────────────────────┬──────────┐        │
│  │ Label Pair                       │ Series   │        │
│  ├──────────────────────────────────┼──────────┤        │
│  │ instance="pod-xyz-123"           │ 12,345   │        │
│  └──────────────────────────────────┴──────────┘        │
│                                                         │
│  RUNTIME FLAGS                                          │
│  storage.tsdb.retention.time = 15d                      │
│  storage.tsdb.path = /prometheus/data                   │
│  web.enable-lifecycle = true                            │
└─────────────────────────────────────────────────────────┘
```

**Features:**

- Build info with version
- TSDB head block stats
- Top cardinality metrics (from TSDB stats)
- Top cardinality label pairs
- Runtime flags display
- WAL stats if available

### 6.6 Metric Metadata Explorer (`/ui/prometheus/metrics`)

**API:**

```
GET /api/v1/metadata            — all metric metadata
GET /api/v1/label/__name__/values — all metric names
GET /api/v1/labels              — all label names
GET /api/v1/status/tsdb         — cardinality info
```

**UI Layout:**

```
┌─────────────────────────────────────────────────────────┐
│  Metric Explorer                                        │
│  🔍 [Search metrics...                            ]     │
│  Filter: [All / Counter / Gauge / Histogram / Summary]  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │ 📊 http_requests_total                          │    │
│  │    Type: counter                                │    │
│  │    Help: Total number of HTTP requests          │    │
│  │    Series count: 1,234                          │    │
│  │    Labels: method, status, handler, instance    │    │
│  │    [Query ▶] [Explore Labels]                   │    │
│  ├─────────────────────────────────────────────────┤    │
│  │ 📊 node_cpu_seconds_total                       │    │
│  │    Type: counter                                │    │
│  │    Help: Seconds the CPUs spent in each mode    │    │
│  │    Series count: 456                            │    │
│  │    Labels: cpu, mode, instance                  │    │
│  │    [Query ▶] [Explore Labels]                   │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

**Features:**

- List all metrics with TYPE and HELP from metadata API
- Search/filter by name, type
- Show estimated series count per metric
- “Query” button → opens metric in Query Explorer
- “Explore Labels” → drills into label names/values for that metric

### 6.7 Config Page (`/ui/prometheus/config`)

**API:** `GET /api/v1/status/config`

**Features:**

- Display the running `prometheus.yml` config with YAML syntax highlighting
- Read-only (display only, no editing)
- Collapsible sections for large configs
- Search within config

### 6.8 Service Discovery Page (`/ui/prometheus/service-discovery`)

**API:** `GET /api/v1/targets?state=any` (includes discovered labels)

**Features:**

- Show discovered targets BEFORE relabeling
- Show target labels AFTER relabeling
- Show dropped targets (targets that were relabeled away)
- Helps debug why a target isn’t being scraped

-----

## 7. SHARED COMPONENTS

These components should be extracted from the existing InfluxDB UI and made reusable:

### 7.1 Chart Component

- Line chart for time-series data
- Handles both InfluxDB result format and Prometheus result format
- Normalize to common format: `{ series: [{ name, tags, values: [{time, value}] }] }`
- Support for: zoom, pan, legend toggle, download as PNG

### 7.2 Data Table Component

- Sortable columns
- Copy cell / copy row
- Export to CSV
- Handles both InfluxDB tabular results and Prometheus vector/matrix results

### 7.3 Code Editor Component

- Based on CodeMirror or Monaco
- Language modes: InfluxQL, PromQL, YAML, JSON
- Syntax highlighting, autocomplete
- Shared wrapper, backend-specific language config

### 7.4 Connection Manager

- Sidebar connection list with type icons
- Add/edit/delete connections
- Test connection
- Store in localStorage
- Merge with CLI-provided connections

### 7.5 JSON Viewer

- Collapsible tree view for raw API responses
- Syntax highlighted
- Copy button

-----

## 8. PROMETHEUS API REFERENCE (For Implementation)

All endpoints relative to Prometheus base URL (e.g., `http://localhost:9090`)

### Query APIs

|Method  |Path                         |Description                                                    |
|--------|-----------------------------|---------------------------------------------------------------|
|GET/POST|`/api/v1/query`              |Instant query. Params: `query`, `time`, `timeout`              |
|GET/POST|`/api/v1/query_range`        |Range query. Params: `query`, `start`, `end`, `step`, `timeout`|
|GET     |`/api/v1/series`             |Find series. Params: `match[]`, `start`, `end`                 |
|GET     |`/api/v1/labels`             |All label names. Params: `start`, `end`, `match[]`             |
|GET     |`/api/v1/label/<name>/values`|Values for a label. Params: `start`, `end`, `match[]`          |
|GET     |`/api/v1/metadata`           |Metric metadata. Params: `metric`, `limit`                     |

### Status APIs

|Method|Path                        |Description                         |
|------|----------------------------|------------------------------------|
|GET   |`/api/v1/status/config`     |Running YAML config                 |
|GET   |`/api/v1/status/flags`      |Command-line flags                  |
|GET   |`/api/v1/status/runtimeinfo`|Runtime info (uptime, storage, etc.)|
|GET   |`/api/v1/status/buildinfo`  |Version, Go version, etc.           |
|GET   |`/api/v1/status/tsdb`       |TSDB stats, cardinality             |
|GET   |`/api/v1/status/walreplay`  |WAL replay status                   |

### Target APIs

|Method|Path                      |Description                                               |
|------|--------------------------|----------------------------------------------------------|
|GET   |`/api/v1/targets`         |All scrape targets. Params: `state` (active/dropped/any)  |
|GET   |`/api/v1/targets/metadata`|Target metadata. Params: `match_target`, `metric`, `limit`|

### Alert APIs

|Method|Path            |Description                                                    |
|------|----------------|---------------------------------------------------------------|
|GET   |`/api/v1/rules` |All rules (alerting + recording). Params: `type` (alert/record)|
|GET   |`/api/v1/alerts`|Active alerts only                                             |

### Admin APIs (require `--web.enable-admin-api`)

|Method|Path                                 |Description         |
|------|-------------------------------------|--------------------|
|POST  |`/api/v1/admin/tsdb/snapshot`        |Create TSDB snapshot|
|POST  |`/api/v1/admin/tsdb/delete_series`   |Delete time series  |
|POST  |`/api/v1/admin/tsdb/clean_tombstones`|Clean tombstones    |

### Lifecycle APIs (require `--web.enable-lifecycle`)

|Method|Path       |Description      |
|------|-----------|-----------------|
|POST  |`/-/reload`|Reload config    |
|POST  |`/-/quit`  |Graceful shutdown|

### Alertmanager v2 APIs (separate URL, default port 9093)

|Method|Path                   |Description        |
|------|-----------------------|-------------------|
|GET   |`/api/v2/alerts`       |All alerts         |
|GET   |`/api/v2/alerts/groups`|Alert groups       |
|GET   |`/api/v2/silences`     |All silences       |
|POST  |`/api/v2/silences`     |Create silence     |
|DELETE|`/api/v2/silence/<id>` |Delete silence     |
|GET   |`/api/v2/status`       |Alertmanager status|
|GET   |`/api/v2/receivers`    |All receivers      |

-----

## 9. PROMETHEUS RESPONSE FORMATS

### Instant Query Response

```json
{
  "status": "success",
  "data": {
    "resultType": "vector",
    "result": [
      {
        "metric": { "__name__": "up", "job": "node", "instance": "localhost:9100" },
        "value": [1708300000, "1"]
      }
    ]
  }
}
```

### Range Query Response

```json
{
  "status": "success",
  "data": {
    "resultType": "matrix",
    "result": [
      {
        "metric": { "__name__": "up", "job": "node", "instance": "localhost:9100" },
        "values": [
          [1708300000, "1"],
          [1708300015, "1"],
          [1708300030, "1"]
        ]
      }
    ]
  }
}
```

### Targets Response

```json
{
  "status": "success",
  "data": {
    "activeTargets": [
      {
        "discoveredLabels": { "__address__": "localhost:9100", "__scheme__": "http" },
        "labels": { "instance": "localhost:9100", "job": "node" },
        "scrapePool": "node",
        "scrapeUrl": "http://localhost:9100/metrics",
        "globalUrl": "http://localhost:9100/metrics",
        "lastError": "",
        "lastScrape": "2026-02-19T10:00:00.000Z",
        "lastScrapeDuration": 0.015,
        "health": "up",
        "scrapeInterval": "15s",
        "scrapeTimeout": "10s"
      }
    ],
    "droppedTargets": []
  }
}
```

### Rules Response

```json
{
  "status": "success",
  "data": {
    "groups": [
      {
        "name": "example",
        "file": "/etc/prometheus/rules.yml",
        "rules": [
          {
            "state": "firing",
            "name": "HighRequestLatency",
            "query": "job:request_latency_seconds:mean5m{job=\"myjob\"} > 0.5",
            "duration": 600,
            "labels": { "severity": "page" },
            "annotations": { "summary": "High request latency" },
            "alerts": [
              {
                "labels": { "alertname": "HighRequestLatency", "instance": "pod-1" },
                "annotations": { "summary": "..." },
                "state": "firing",
                "activeAt": "2026-02-19T08:30:00.000Z",
                "value": "0.823"
              }
            ],
            "health": "ok",
            "type": "alerting"
          }
        ]
      }
    ]
  }
}
```

-----

## 10. IMPLEMENTATION ORDER

### Phase 1: Foundation (Do First)

1. Refactor `main.go` — add generic proxy handler, new CLI flags
1. Refactor connection model — add `type` field, update localStorage schema
1. Refactor sidebar — dynamic menu based on connection type
1. Refactor React router — add `/ui/prometheus/` routes
1. Add Connection dialog — type selector (InfluxDB / Prometheus), test connection
1. Move existing InfluxDB pages under `/ui/influxdb/` prefix

### Phase 2: Core Prometheus Pages

1. Prometheus Query Explorer (query + query_range + chart + table)
1. Targets page (targets API + status display)
1. TSDB Status page (tsdb + runtimeinfo + buildinfo + flags)
1. Metric Metadata Explorer (metadata + labels)

### Phase 3: Alerting

1. Alert Rules page (rules API)
1. Alertmanager page (v2 API — alerts, silences, status)
1. Config page (read-only YAML display)
1. Service Discovery page (targets with discovered labels)

### Phase 4: Polish

1. PromQL autocomplete and syntax highlighting
1. Shared chart component normalization
1. Query history per connection
1. Auto-refresh on applicable pages
1. Dark/light theme toggle
1. Export query results (CSV, JSON)
1. –connections file support
1. –readonly / –disable-write / –disable-admin support
1. Update README.md with all new features and CLI docs

-----

## 11. BUILD & RELEASE

### Build Commands

```bash
# Build UI
cd ui && npm install && npm run build && cd ..

# Build binary (embeds UI)
go build -o timeseriesui .

# Cross-compile for multiple platforms
GOOS=linux   GOARCH=amd64 go build -o timeseriesui-linux-amd64 .
GOOS=darwin  GOARCH=amd64 go build -o timeseriesui-darwin-amd64 .
GOOS=darwin  GOARCH=arm64 go build -o timeseriesui-darwin-arm64 .
GOOS=windows GOARCH=amd64 go build -o timeseriesui-windows-amd64.exe .
```

### Docker

```dockerfile
FROM scratch
COPY timeseriesui-linux-amd64 /timeseriesui
EXPOSE 8080
ENTRYPOINT ["/timeseriesui"]
```

```bash
docker run -p 8080:8080 tidedb/timeseriesui \
  --prometheus-url http://prometheus:9090 \
  --influxdb-url http://influxdb:8086
```

-----

## 12. FUTURE BACKENDS (Planned, Not In Scope Now)

For future reference, the same pattern extends to:

|Backend        |API Base                        |Query Language    |
|---------------|--------------------------------|------------------|
|VictoriaMetrics|Same as Prometheus API          |PromQL + MetricsQL|
|Thanos         |Same as Prometheus API (Querier)|PromQL            |
|Mimir          |Same as Prometheus API          |PromQL            |
|Graphite       |`/render`, `/metrics/find`      |Graphite functions|
|InfluxDB 2.x   |`/api/v2/query`                 |Flux              |
|QuestDB        |`/exec`                         |SQL               |

VictoriaMetrics and Thanos would essentially work as “Prometheus” connections with no code changes (since they speak the same API). Just add them as Prometheus connections.

-----

## 13. TESTING NOTES

### For Development

```bash
# Run a local Prometheus for testing
docker run -p 9090:9090 prom/prometheus

# Run a local Alertmanager for testing
docker run -p 9093:9093 prom/alertmanager

# Run a local InfluxDB 1.x for testing
docker run -p 8086:8086 influxdb:1.12

# Run TimeseriesUI connecting to all
./timeseriesui \
  --influxdb-url http://localhost:8086 \
  --prometheus-url http://localhost:9090 \
  --alertmanager-url http://localhost:9093
```

### Test Connection Endpoints

- InfluxDB: `GET http://localhost:8086/ping` → 204
- Prometheus: `GET http://localhost:9090/api/v1/status/buildinfo` → JSON
- Alertmanager: `GET http://localhost:9093/api/v2/status` → JSON