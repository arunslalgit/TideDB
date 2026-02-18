# TideDB

A community fork of [InfluxDB OSS v1.12.2](https://github.com/influxdata/influxdb)
with an embedded web UI, resumable downsampling, and horizontal scaling.

> **TideDB is NOT affiliated with, endorsed by, or supported by InfluxData, Inc.**
> See [FORK_NOTICE.md](./FORK_NOTICE.md) for details.

## Why TideDB?

InfluxDB 1.x is one of the most widely deployed time-series databases in the world.
But it was abandoned in favor of a complete rewrite (2.x, then 3.x), leaving millions
of deployments without a path forward.

TideDB continues where InfluxDB 1.x left off:

- **Built-in Web UI** — No separate Chronograf needed. Query, manage, and monitor
  your database from a browser.
- **Resumable Downsampling** *(coming soon)* — Declarative, cursor-based downsampling
  with backfill support and late-arrival handling.
- **Horizontal Scaling** *(planned)* — Native clustering in the open-source version.

## Quick Start

### Binary

Download the latest release and run:
```bash
./influxd run
# API: http://localhost:8086
# UI:  http://localhost:8086/ui/
```

### Docker

```bash
docker run -p 8086:8086 tidedb/tidedb:latest
```

## Compatibility

TideDB is fully compatible with:
- InfluxDB 1.x line protocol
- InfluxQL
- Telegraf
- Grafana InfluxDB data source
- All existing InfluxDB 1.x client libraries

## License

TideDB is licensed under the Apache License 2.0. See [LICENSE](./LICENSE) for details.

Original InfluxDB code is copyright InfluxData, Inc. and licensed under MIT/Apache 2.0.
