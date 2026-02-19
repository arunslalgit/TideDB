# TimeseriesUI

A unified web UI for time-series databases. Single binary. Zero dependencies. Supports **InfluxDB 1.x** and **Prometheus** (with Alertmanager).

Add connections in the browser and switch between multiple backends — InfluxDB instances, Prometheus servers, and more — all from one interface.

> **TimeseriesUI is NOT affiliated with, endorsed by, or supported by InfluxData, Inc. or the Prometheus Authors.**
> "InfluxDB" is a trademark of InfluxData, Inc. "Prometheus" is a trademark of The Linux Foundation.

---

## Features

### General
- **Multi-backend** — manage InfluxDB and Prometheus connections from one UI
- **Multi-connection** — switch between multiple instances from the sidebar
- **Zero server-side state** — connections stored in browser `localStorage`; the binary is stateless
- **Single binary** — Go embeds all UI assets; no runtime dependencies
- **CLI pre-configuration** — pass `--influxdb-url` or `--prometheus-url` to auto-add connections

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

## Quick Start

```bash
# Start empty — add connections in the browser
./timeseriesui

# Quick start with InfluxDB
./timeseriesui --influxdb-url http://localhost:8086

# Quick start with Prometheus
./timeseriesui --prometheus-url http://localhost:9090

# Both at once
./timeseriesui \
  --influxdb-url http://localhost:8086 \
  --prometheus-url http://localhost:9090

# With Alertmanager
./timeseriesui \
  --prometheus-url http://localhost:9090 \
  --alertmanager-url http://localhost:9093

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
  --base-path string            Base URL path prefix, e.g. /tsui (default "/")
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

  --connections string          Path to a JSON connections file

LOGGING & DEBUG:
  --log-level string            Log verbosity: debug, info, warn, error (default "info")
  --proxy-timeout duration      Timeout for proxied API requests (default 30s)

FEATURE FLAGS:
  --disable-write               Disable the Write Data feature (read-only mode)
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
    }
  ]
}
```

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

## Architecture

```
timeseriesui/
├── main.go          # Go HTTP server — proxies API calls, embeds UI
├── go.mod           # No external Go dependencies (stdlib only)
├── ui/
│   ├── src/         # React + TypeScript source
│   │   ├── api/     # Backend API clients (InfluxDB, Prometheus)
│   │   ├── components/  # Shared components (Layout, ConnectionManager)
│   │   ├── hooks/   # React hooks
│   │   └── pages/   # Page components
│   │       ├── QueryExplorer.tsx      # InfluxDB query page
│   │       ├── DatabaseAdmin.tsx      # InfluxDB admin page
│   │       ├── WriteData.tsx          # InfluxDB write page
│   │       ├── SystemHealth.tsx       # InfluxDB health page
│   │       └── prometheus/            # Prometheus pages
│   │           ├── PromQueryExplorer.tsx
│   │           ├── PromTargets.tsx
│   │           ├── PromAlertRules.tsx
│   │           ├── PromAlertmanager.tsx
│   │           ├── PromTSDB.tsx
│   │           ├── PromMetrics.tsx
│   │           ├── PromConfig.tsx
│   │           └── PromServiceDiscovery.tsx
│   └── dist/        # Built assets (embedded into the binary)
├── bin/             # Pre-built binaries
├── LICENSE          # Apache 2.0
└── NOTICE
```

The Go binary embeds `ui/dist/` at compile time using Go's `embed` package. The proxy architecture solves CORS — the browser talks to the Go server, which forwards requests to the actual backends.

## Contributing

Pull requests are welcome. By submitting a contribution you agree to license it under the Apache License 2.0.

## License

Apache License 2.0 — see [LICENSE](./LICENSE).
