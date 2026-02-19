# TimeseriesUI

A unified web UI for time-series databases. Single binary. Zero dependencies. Supports **InfluxDB 1.x**, **Prometheus** (with Alertmanager), and **VictoriaMetrics**.

Add connections in the browser and switch between multiple backends — InfluxDB instances, Prometheus servers, VictoriaMetrics clusters, and more — all from one interface.

> **TimeseriesUI is NOT affiliated with, endorsed by, or supported by InfluxData, Inc., the Prometheus Authors, or VictoriaMetrics, Inc.**
> "InfluxDB" is a trademark of InfluxData, Inc. "Prometheus" is a trademark of The Linux Foundation. "VictoriaMetrics" is a trademark of VictoriaMetrics, Inc.

---

## Features

### General
- **Multi-backend** — manage InfluxDB, Prometheus, and VictoriaMetrics connections from one UI
- **Multi-connection** — switch between multiple instances from the sidebar
- **Zero server-side state** — connections stored in browser `localStorage`; the binary is stateless
- **Single binary** — Go embeds all UI assets; no runtime dependencies
- **CLI pre-configuration** — pass `--influxdb-url`, `--prometheus-url`, or `--vm-url` to auto-add connections
- **Reverse proxy support** — works behind nginx/Caddy/Traefik at any sub-path via `--base-path`
- **HTTP proxy support** — per-connection proxy URL for corporate/SOCKS proxy environments

### InfluxDB
- **Query Explorer** — InfluxQL editor with syntax highlighting, schema tree, table & chart results
- **Database Admin** — create/drop databases, manage retention policies, continuous queries, and users
- **Write Data** — paste or upload line protocol directly from the browser
- **System Health** — live diagnostics, stats, active queries (with kill), and shard groups

### Prometheus
- **PromQL Query Explorer** — query editor with metric autocomplete, time range selector, chart & table results
- **Scrape Targets** — view all targets grouped by job, with health status and scrape duration
- **Alert Rules** — view alerting and recording rules with state indicators (firing/pending/inactive)
- **Alertmanager** — view firing alerts, manage silences, view cluster status
- **TSDB Status** — head block stats, top cardinality metrics, runtime info, build info, and flags
- **Metric Explorer** — browse all metrics with TYPE, HELP, and quick-query buttons
- **Config Viewer** — read-only view of running `prometheus.yml` with search
- **Service Discovery** — compare discovered vs target labels, view dropped targets

### VictoriaMetrics
All Prometheus-compatible pages work with VictoriaMetrics out of the box (MetricsQL labels shown automatically), plus these VM-exclusive features:

- **Enhanced TSDB Status** — cardinality explorer with `focusLabel`, date, and match filters; bar chart visualizations
- **Active Queries** — live view of running queries and top queries by count, avg duration, and total duration
- **Snapshots** — create, list, and delete TSDB snapshots from the browser
- **Export / Import** — export and import data in JSON, CSV, native, and Prometheus text formats
- **Admin Operations** — delete series, force merge partitions, and reset rollup result cache
- **Cluster Mode** — tenant ID and vminsert URL support for VictoriaMetrics cluster deployments

## Quick Start

```bash
# Start empty — add connections in the browser
./timeseriesui

# Quick start with InfluxDB
./timeseriesui --influxdb-url http://localhost:8086

# Quick start with Prometheus
./timeseriesui --prometheus-url http://localhost:9090

# Quick start with VictoriaMetrics
./timeseriesui --vm-url http://localhost:8428

# All three at once
./timeseriesui \
  --influxdb-url http://localhost:8086 \
  --prometheus-url http://localhost:9090 \
  --vm-url http://localhost:8428

# With Alertmanager
./timeseriesui \
  --prometheus-url http://localhost:9090 \
  --alertmanager-url http://localhost:9093

# VictoriaMetrics cluster with tenant
./timeseriesui \
  --vm-url http://vmselect:8481 \
  --vm-tenant 0:0

# Multiple Prometheus instances
./timeseriesui \
  --prometheus-url http://prom-prod:9090 \
  --prometheus-url http://prom-staging:9090

# Choose a different port
./timeseriesui --port 3000

# Read-only mode (disable writes and admin operations)
./timeseriesui --readonly --influxdb-url http://prod:8086
```

Open **http://localhost:8080/ui/** in your browser.

## CLI Reference

```
timeseriesui [flags]

SERVER FLAGS:
  --port int                    Port to listen on (default 8080)
  --host string                 Host/IP to bind to (default "0.0.0.0")
  --base-path string            Base URL path prefix, e.g. /tsui
  --tls-cert string             Path to TLS certificate file (enables HTTPS)
  --tls-key string              Path to TLS private key file

CONNECTION FLAGS:
  --influxdb-url string         Add a default InfluxDB connection (repeatable)
  --influxdb-user string        Default InfluxDB username
  --influxdb-password string    Default InfluxDB password
  --influxdb-name string        Display name for the InfluxDB connection

  --prometheus-url string       Add a default Prometheus connection (repeatable)
  --prometheus-user string      Default Prometheus basic-auth username
  --prometheus-password string  Default Prometheus basic-auth password
  --prometheus-name string      Display name for the Prometheus connection
  --alertmanager-url string     Default Alertmanager URL

  --vm-url string               Add a default VictoriaMetrics connection (repeatable)
  --vm-user string              Default VictoriaMetrics basic-auth username
  --vm-password string          Default VictoriaMetrics basic-auth password
  --vm-name string              Display name for the VictoriaMetrics connection
  --vm-tenant string            Tenant ID for cluster mode (e.g. 0 or 0:0)

  --connections string          Path to a JSON connections file

LOGGING & DEBUG:
  --log-level string            Log verbosity: debug, info, warn, error (default "info")
  --proxy-timeout duration      Timeout for proxied API requests (default 30s)

FEATURE FLAGS:
  --disable-write               Disable the Write Data feature
  --disable-admin               Disable admin/destructive operations
  --readonly                    Shorthand for --disable-write --disable-admin

META:
  --version                     Print version and exit
  --help                        Print help and exit
```

### Connections File

Use `--connections connections.json` to pre-configure multiple backends:

```json
{
  "connections": [
    {
      "name": "Production InfluxDB",
      "type": "influxdb",
      "url": "https://influx-prod:8086",
      "username": "admin",
      "password": "secret"
    },
    {
      "name": "Production Prometheus",
      "type": "prometheus",
      "url": "http://prometheus-prod:9090",
      "alertmanagerUrl": "http://alertmanager-prod:9093"
    },
    {
      "name": "VictoriaMetrics Cluster",
      "type": "victoriametrics",
      "url": "http://vmselect:8481",
      "clusterMode": true,
      "tenantId": "0:0",
      "vminsertUrl": "http://vminsert:8480"
    }
  ]
}
```

### Connection Options

Each connection in the JSON file (or the browser UI) supports:

| Field | Type | Description |
|---|---|---|
| `name` | string | Display name |
| `type` | string | `"influxdb"`, `"prometheus"`, or `"victoriametrics"` |
| `url` | string | Base URL of the database |
| `username` | string | Basic-auth username (optional) |
| `password` | string | Basic-auth password (optional) |
| `alertmanagerUrl` | string | Alertmanager URL (Prometheus/VM only) |
| `proxyUrl` | string | HTTP proxy URL for this connection (optional) |
| `clusterMode` | boolean | Enable VM cluster mode (VM only) |
| `tenantId` | string | Tenant ID e.g. `"0:0"` (VM cluster only) |
| `vminsertUrl` | string | vminsert URL for imports (VM cluster only) |

## Reverse Proxy (nginx)

TimeseriesUI works behind a reverse proxy at any sub-path using `--base-path`.

### Example: serve at `/timeseries-ui/`

**1. Start TimeseriesUI with `--base-path`:**

```bash
./timeseriesui --base-path /timeseries-ui --port 8087
```

**2. Configure nginx:**

```nginx
location /timeseries-ui/ {
    proxy_pass http://127.0.0.1:8087/timeseries-ui/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Open `https://your-server/timeseries-ui/ui/` in your browser.

**How it works:** `--base-path /timeseries-ui` prefixes all server routes (UI, API, proxies) with `/timeseries-ui`. The SPA automatically picks up the prefix for routing and API calls.

### Caddy example

```
handle_path /timeseries-ui/* {
    reverse_proxy localhost:8087
}
```

```bash
./timeseriesui --base-path /timeseries-ui --port 8087
```

### Important notes
- The `--base-path` value must **not** end with a slash (e.g. `--base-path /tsui`, not `--base-path /tsui/`).
- Without `--base-path`, the UI is at `http://host:port/ui/` and no special proxy config is needed.
- TLS termination is handled by nginx; you do not need `--tls-cert` when behind a reverse proxy.

## Build from Source

**Requirements:** Go 1.21+, Node.js 20+

```bash
git clone https://github.com/arunslalgit/TideDB.git
cd TideDB

# Build the UI
cd ui && npm install && npm run build && cd ..

# Build the binary (embeds the UI)
go build -o timeseriesui .

# Cross-compile
GOOS=linux   GOARCH=amd64 go build -o timeseriesui-linux-amd64 .
GOOS=darwin  GOARCH=arm64 go build -o timeseriesui-darwin-arm64 .
GOOS=windows GOARCH=amd64 go build -o timeseriesui-windows-amd64.exe .
```

## Compatibility

### InfluxDB
Works with any server that speaks the InfluxDB 1.x HTTP API:
- InfluxDB OSS 1.x / Enterprise 1.x
- TideDB
- VictoriaMetrics (InfluxDB-compatible endpoint)

### Prometheus
Works with any server that speaks the Prometheus HTTP API:
- Prometheus
- VictoriaMetrics (Prometheus-compatible API)
- Thanos (Querier component)
- Grafana Mimir
- Cortex

### VictoriaMetrics
First-class support with VM-exclusive features:
- VictoriaMetrics single-node
- VictoriaMetrics cluster (vmselect + vminsert + vmstorage)

## Architecture

```
timeseriesui/
├── main.go              # Go HTTP server — proxies API calls, embeds UI
├── go.mod               # No external Go dependencies (stdlib only)
├── ui/
│   ├── src/             # React + TypeScript source
│   │   ├── api/         # Backend API clients
│   │   │   ├── client.ts          # InfluxDB client
│   │   │   ├── prometheus.ts      # Prometheus client
│   │   │   └── victoriametrics.ts # VictoriaMetrics client
│   │   ├── components/  # Shared components (Layout, ConnectionManager)
│   │   ├── hooks/       # React hooks
│   │   └── pages/       # Page components
│   │       ├── influxdb/          # InfluxDB pages
│   │       ├── prometheus/        # Prometheus pages (shared with VM)
│   │       └── victoriametrics/   # VM-exclusive pages
│   └── dist/            # Built assets (embedded into the binary)
├── bin/                 # Pre-built binaries
├── LICENSE              # Apache 2.0
└── NOTICE
```

The Go binary embeds `ui/dist/` at compile time using Go's `embed` package. The proxy architecture solves CORS — the browser talks to the Go server, which forwards requests to the actual backends.

## Contributing

Pull requests are welcome. By submitting a contribution you agree to license it under the Apache License 2.0.

## License

Apache License 2.0 — see [LICENSE](./LICENSE).
