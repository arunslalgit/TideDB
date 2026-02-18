# TimeseriesUI

A standalone web UI for [InfluxDB](https://www.influxdata.com/products/influxdb/) 1.x (and compatible) time-series databases.

Single binary. No dependencies. Add connections in the browser and switch between multiple InfluxDB instances.

> **TimeseriesUI is NOT affiliated with, endorsed by, or supported by InfluxData, Inc.**
> "InfluxDB" is a trademark of InfluxData, Inc.

---

## Features

- **Multi-connection** — manage and switch between multiple InfluxDB instances from the sidebar
- **Query Explorer** — InfluxQL editor with syntax highlighting, schema tree, table & chart results
- **Database Admin** — create/drop databases, manage retention policies, continuous queries, and users
- **Write Data** — paste or upload line protocol directly from the browser
- **System Health** — live diagnostics, stats, active queries (with kill), and shard groups
- **Zero server-side state** — connections are stored in browser `localStorage`; the binary is stateless

## Quick Start

### Download a release

```bash
# Run against a local InfluxDB
./timeseriesui

# Run against a remote InfluxDB (sets the default connection)
./timeseriesui --influxdb-url http://myserver:8086

# Choose a different port
./timeseriesui --port 3000
```

Open **http://localhost:8080/ui/** in your browser.

### Build from source

**Requirements:** Go 1.21+, Node.js 20+

```bash
git clone https://github.com/YOUR_ORG/timeseriesui.git
cd timeseriesui

# Build the UI
cd ui && npm install && npm run build && cd ..

# Build the binary (embeds the UI)
go build -o timeseriesui .

# Run
./timeseriesui
```

## Usage

```
timeseriesui [flags]

Flags:
  --influxdb-url string   Default InfluxDB URL (optional; connections can be added in the UI)
  --port int              Port to listen on (default 8080)
```

Without `--influxdb-url`, the server starts with no default connection. Use the **Connections** panel in the sidebar to add one or more InfluxDB instances.

## Compatibility

Works with any server that speaks the InfluxDB 1.x HTTP API:

- InfluxDB OSS 1.x
- InfluxDB Enterprise 1.x
- TideDB
- VictoriaMetrics (InfluxDB compatibility endpoint)
- Telegraf (as a proxy)

## Architecture

```
timeseriesui/
├── main.go          # Go HTTP server — proxies API, embeds UI
├── go.mod           # No external Go dependencies (stdlib only)
├── ui/
│   ├── src/         # React + TypeScript source
│   └── dist/        # Built assets (embedded into the binary at build time)
├── LICENSE          # Apache 2.0
└── NOTICE
```

The Go binary embeds `ui/dist/` at compile time using Go's `embed` package. The result is a single self-contained binary with no runtime dependencies.

## Contributing

Pull requests are welcome. By submitting a contribution you agree to license it under the Apache License 2.0.

## License

Apache License 2.0 — see [LICENSE](./LICENSE).
