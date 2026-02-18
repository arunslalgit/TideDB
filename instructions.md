# TideDB: InfluxDB 1.x Fork — Implementation Specification

## Project Overview

TideDB is a community fork of InfluxDB OSS v1.12.2 (the latest 1.x release) with an embedded web UI, resumable downsampling, and a roadmap toward horizontal scaling. This document covers **Phase 0: Fork Setup + Embedded Web UI**.

The goal is to produce a single Go binary (`tided`) that, when started, serves both the existing InfluxDB 1.x HTTP API and a modern embedded web UI on the same port — zero additional components required.

-----

## Part 1: Fork and Rename

### 1.1 Clone the Source

```bash
# Clone the 1.x branch specifically
git clone --branch v1.12.2 https://github.com/influxdata/influxdb.git tidedb
cd tidedb

# Remove upstream remote
git remote remove origin

# Add your own remote
git remote add origin git@github.com:<your-username>/tidedb.git

# Create a fresh main branch
git checkout -b main
git push -u origin main
```

### 1.2 License Compliance

This is critical. InfluxDB 1.x is dual-licensed MIT / Apache 2.0. You MUST:

1. **Keep the original LICENSE file** — do NOT delete or modify it
1. **Create a NOTICE file** in the repo root:

```
TideDB
Copyright 2025 TideDB Contributors

This product is based on InfluxDB OSS v1.12.2
Originally developed by InfluxData, Inc.
Copyright 2013-2025 InfluxData, Inc.

Licensed under the MIT License and Apache License, Version 2.0.
See LICENSE-MIT and LICENSE-APACHE for details.
```

1. **Rename license files** for clarity:
- Copy the existing `LICENSE` to `LICENSE-MIT`
- Add an `LICENSE-APACHE` file with the Apache 2.0 text
- Keep a top-level `LICENSE` that references both
1. **Add a FORK_NOTICE.md** explaining the lineage:

```markdown
# Fork Notice

TideDB is an independent community fork of [InfluxDB OSS](https://github.com/influxdata/influxdb) v1.12.2,
originally developed by [InfluxData, Inc](https://www.influxdata.com/).

TideDB is NOT affiliated with, endorsed by, or supported by InfluxData, Inc.
"InfluxDB" is a trademark of InfluxData, Inc.

This fork exists to continue development of the 1.x line with features the
community has long requested: an embedded web UI, resumable downsampling,
and horizontal scaling.

All original InfluxDB code retains its MIT/Apache 2.0 license.
All new code added by TideDB contributors is licensed under Apache 2.0.
```

### 1.3 Go Module Rename

Rename the Go module from `github.com/influxdata/influxdb` to your own module path. This is a large but mechanical change:

```bash
# The old module path
OLD_MODULE="github.com/influxdata/influxdb"
# Your new module path
NEW_MODULE="github.com/<your-username>/tidedb"

# Rename the module in go.mod
sed -i "s|module ${OLD_MODULE}|module ${NEW_MODULE}|g" go.mod

# Rename all internal imports across the entire codebase
find . -name '*.go' -exec sed -i "s|${OLD_MODULE}|${NEW_MODULE}|g" {} +

# Update go.sum
go mod tidy
```

**Important**: This will touch hundreds of files. Commit this as a single atomic commit with message:

```
chore: rename Go module from influxdata/influxdb to <your-username>/tidedb
```

### 1.4 Binary Rename

Rename the main binaries:

|Old Binary      |New Binary    |Location                                   |
|----------------|--------------|-------------------------------------------|
|`influxd`       |`tided`       |`cmd/influxd/` → `cmd/tided/`              |
|`influx`        |`tide`        |`cmd/influx/` → `cmd/tide/`                |
|`influx_inspect`|`tide_inspect`|`cmd/influx_inspect/` → `cmd/tide_inspect/`|

Steps:

```bash
# Rename directories
mv cmd/influxd cmd/tided
mv cmd/influx cmd/tide
mv cmd/influx_inspect cmd/tide_inspect

# Update all references to binary names in:
# - Makefiles
# - Dockerfiles
# - systemd service files
# - shell scripts
# - documentation
# - Go source code (especially main.go files and version strings)

# Update the server name / branding in the HTTP response headers
# In services/httpd/handler.go, change the X-Influxdb-Version header to X-Tidedb-Version
```

### 1.5 Version and Branding

Create `internal/branding/branding.go`:

```go
package branding

const (
    ProductName    = "TideDB"
    ServerHeader   = "X-Tidedb-Version"
    DefaultPort    = 8086
    UIPath         = "/ui/"
    APIDocsURL     = "https://github.com/<your-username>/tidedb"
)

// Version is set at build time via -ldflags
var (
    Version   = "0.1.0"
    Commit    = "unknown"
    BuildDate = "unknown"
)
```

Update the Makefile build flags:

```makefile
LDFLAGS=-ldflags "-X github.com/<your-username>/tidedb/internal/branding.Version=$(VERSION) \
                   -X github.com/<your-username>/tidedb/internal/branding.Commit=$(COMMIT) \
                   -X github.com/<your-username>/tidedb/internal/branding.BuildDate=$(BUILD_DATE)"
```

### 1.6 Verify the Fork Compiles and Tests Pass

```bash
# Build
go build ./cmd/tided
go build ./cmd/tide
go build ./cmd/tide_inspect

# Run existing tests
go test ./...

# Start the server and verify it works
./tided run
# In another terminal:
curl -s http://localhost:8086/ping
# Should return 204
```

**Do NOT proceed to Phase 0 (UI) until the renamed fork compiles cleanly and passes all existing tests.**

-----

## Part 2: Embedded Web UI — Architecture

### 2.1 Overview

The UI is a React single-page application (SPA) that is compiled to static assets and embedded directly into the Go binary using Go’s `embed` package. When users navigate to `http://localhost:8086/ui/`, they get a fully functional database management interface.

### 2.2 Directory Structure

```
tidedb/
├── cmd/
│   ├── tided/              # main server binary
│   └── tide/               # CLI client
├── ui/                     # <-- NEW: React SPA
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api/
│   │   │   └── client.ts          # HTTP client for InfluxDB API
│   │   ├── pages/
│   │   │   ├── QueryExplorer.tsx   # InfluxQL query editor
│   │   │   ├── DatabaseAdmin.tsx   # DB/RP/user management
│   │   │   ├── WriteData.tsx       # Write interface
│   │   │   └── SystemHealth.tsx    # Server diagnostics
│   │   ├── components/
│   │   │   ├── Layout.tsx          # App shell with sidebar nav
│   │   │   ├── QueryEditor.tsx     # CodeMirror-based editor
│   │   │   ├── ResultsTable.tsx    # Tabular query results
│   │   │   ├── TimeSeriesChart.tsx # Line chart for results
│   │   │   ├── SchemaTree.tsx      # DB > RP > Measurement tree
│   │   │   ├── QueryHistory.tsx    # Recent queries list
│   │   │   └── ConnectionBar.tsx   # Server connection status
│   │   ├── hooks/
│   │   │   ├── useQuery.ts         # Execute InfluxQL queries
│   │   │   ├── useSchema.ts        # Fetch schema metadata
│   │   │   └── useDiagnostics.ts   # Fetch server stats
│   │   └── utils/
│   │       ├── influxql.ts         # Query formatting helpers
│   │       └── time.ts             # Time formatting
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── tailwind.config.js
├── services/
│   ├── httpd/                      # existing HTTP service
│   │   ├── handler.go              # MODIFY: add UI routes
│   │   └── ...
│   └── ...
├── ui_embed.go              # <-- NEW: Go embed directive
├── go.mod
├── Makefile                 # MODIFY: add UI build step
└── ...
```

### 2.3 How Embedding Works

Create `ui_embed.go` in the repository root:

```go
package tidedb

import "embed"

// UIAssets contains the compiled React SPA.
// The embed directive includes all files from ui/dist/.
// This is populated at build time after `npm run build` in the ui/ directory.
//
//go:embed ui/dist/*
var UIAssets embed.FS
```

The build process is:

1. `cd ui && npm install && npm run build` → produces `ui/dist/`
1. `go build ./cmd/tided` → Go compiler embeds `ui/dist/*` into the binary
1. The resulting `tided` binary is fully self-contained

-----

## Part 3: UI Frontend Implementation

### 3.1 Project Setup

```bash
cd ui/

# Initialize the project
npm create vite@latest . -- --template react-ts

# Install dependencies
npm install react-router-dom@6
npm install @codemirror/lang-sql @codemirror/view @codemirror/state codemirror
npm install @uiw/react-codemirror
npm install recharts
npm install lucide-react
npm install clsx

# Dev dependencies
npm install -D tailwindcss @tailwindcss/vite
npm install -D @types/react @types/react-dom
```

### 3.2 Vite Configuration

`ui/vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/ui/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/query': 'http://localhost:8086',
      '/write': 'http://localhost:8086',
      '/ping': 'http://localhost:8086',
      '/debug': 'http://localhost:8086',
    },
  },
});
```

**Key: `base: '/ui/'`** — This ensures all asset paths are prefixed with `/ui/` so they work when served by the Go server.

### 3.3 Tailwind CSS

`ui/src/main.css`:

```css
@import "tailwindcss";
```

### 3.4 Entry Point

`ui/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>TideDB</title>
    <link rel="icon" type="image/svg+xml" href="/ui/favicon.svg" />
  </head>
  <body class="bg-gray-950 text-gray-100 antialiased">
    <div id="root"></div>
    <script type="module" src="/ui/src/main.tsx"></script>
  </body>
</html>
```

`ui/src/main.tsx`:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './main.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename="/ui">
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
```

### 3.5 API Client

`ui/src/api/client.ts`:

```typescript
// TideDB API Client
// Communicates with the InfluxDB 1.x HTTP API

export interface QueryResult {
  results: Array<{
    statement_id: number;
    series?: Array<{
      name: string;
      tags?: Record<string, string>;
      columns: string[];
      values: any[][];
    }>;
    error?: string;
  }>;
}

export interface DiagnosticsResult {
  [section: string]: {
    columns: string[];
    rows: any[][];
  };
}

export interface StatsResult {
  [key: string]: any;
}

class TideDBClient {
  private baseUrl: string;
  private credentials: { username?: string; password?: string } = {};

  constructor() {
    // When served embedded, the API is on the same origin
    this.baseUrl = '';
  }

  setCredentials(username: string, password: string) {
    this.credentials = { username, password };
  }

  private getAuthParams(): string {
    const params = new URLSearchParams();
    if (this.credentials.username) {
      params.set('u', this.credentials.username);
    }
    if (this.credentials.password) {
      params.set('p', this.credentials.password);
    }
    return params.toString();
  }

  async ping(): Promise<{ version: string; ok: boolean }> {
    try {
      const res = await fetch(`${this.baseUrl}/ping`);
      return {
        version: res.headers.get('X-Tidedb-Version') || res.headers.get('X-Influxdb-Version') || 'unknown',
        ok: res.status === 204,
      };
    } catch {
      return { version: 'unknown', ok: false };
    }
  }

  async query(q: string, db?: string, epoch?: string): Promise<QueryResult> {
    const params = new URLSearchParams();
    params.set('q', q);
    if (db) params.set('db', db);
    if (epoch) params.set('epoch', epoch);

    const authParams = this.getAuthParams();
    if (authParams) {
      const authParsed = new URLSearchParams(authParams);
      authParsed.forEach((v, k) => params.set(k, v));
    }

    const res = await fetch(`${this.baseUrl}/query?${params.toString()}`, {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Query failed (${res.status}): ${text}`);
    }

    return res.json();
  }

  async write(db: string, data: string, precision: string = 'ns', rp?: string): Promise<void> {
    const params = new URLSearchParams();
    params.set('db', db);
    params.set('precision', precision);
    if (rp) params.set('rp', rp);

    const authParams = this.getAuthParams();
    if (authParams) {
      const authParsed = new URLSearchParams(authParams);
      authParsed.forEach((v, k) => params.set(k, v));
    }

    const res = await fetch(`${this.baseUrl}/write?${params.toString()}`, {
      method: 'POST',
      body: data,
    });

    if (!res.ok && res.status !== 204) {
      const text = await res.text();
      throw new Error(`Write failed (${res.status}): ${text}`);
    }
  }

  async getDiagnostics(): Promise<QueryResult> {
    return this.query('SHOW DIAGNOSTICS');
  }

  async getStats(): Promise<QueryResult> {
    return this.query('SHOW STATS');
  }

  async getDatabases(): Promise<string[]> {
    const result = await this.query('SHOW DATABASES');
    const series = result.results?.[0]?.series?.[0];
    if (!series) return [];
    return series.values.map((v: any[]) => v[0] as string);
  }

  async getRetentionPolicies(db: string): Promise<any[]> {
    const result = await this.query(`SHOW RETENTION POLICIES ON "${db}"`);
    const series = result.results?.[0]?.series?.[0];
    if (!series) return [];
    return series.values.map((v: any[]) => {
      const rp: Record<string, any> = {};
      series.columns.forEach((col: string, i: number) => {
        rp[col] = v[i];
      });
      return rp;
    });
  }

  async getMeasurements(db: string): Promise<string[]> {
    const result = await this.query('SHOW MEASUREMENTS', db);
    const series = result.results?.[0]?.series?.[0];
    if (!series) return [];
    return series.values.map((v: any[]) => v[0] as string);
  }

  async getTagKeys(db: string, measurement: string): Promise<string[]> {
    const result = await this.query(`SHOW TAG KEYS FROM "${measurement}"`, db);
    const series = result.results?.[0]?.series?.[0];
    if (!series) return [];
    return series.values.map((v: any[]) => v[0] as string);
  }

  async getFieldKeys(db: string, measurement: string): Promise<Array<{ key: string; type: string }>> {
    const result = await this.query(`SHOW FIELD KEYS FROM "${measurement}"`, db);
    const series = result.results?.[0]?.series?.[0];
    if (!series) return [];
    return series.values.map((v: any[]) => ({ key: v[0], type: v[1] }));
  }

  async getSeriesCardinality(db: string): Promise<number> {
    const result = await this.query('SHOW SERIES CARDINALITY', db);
    const series = result.results?.[0]?.series?.[0];
    if (!series) return 0;
    return series.values[0][0] as number;
  }

  async getRunningQueries(): Promise<any[]> {
    const result = await this.query('SHOW QUERIES');
    const series = result.results?.[0]?.series?.[0];
    if (!series) return [];
    return series.values.map((v: any[]) => {
      const q: Record<string, any> = {};
      series.columns.forEach((col: string, i: number) => {
        q[col] = v[i];
      });
      return q;
    });
  }

  async killQuery(queryId: number): Promise<void> {
    await this.query(`KILL QUERY ${queryId}`);
  }

  async getDebugVars(): Promise<any> {
    const res = await fetch(`${this.baseUrl}/debug/vars`);
    return res.json();
  }

  async getContinuousQueries(db?: string): Promise<any[]> {
    const result = await this.query('SHOW CONTINUOUS QUERIES', db);
    return result.results?.[0]?.series || [];
  }

  async getShardGroups(): Promise<any[]> {
    const result = await this.query('SHOW SHARD GROUPS');
    const series = result.results?.[0]?.series?.[0];
    if (!series) return [];
    return series.values.map((v: any[]) => {
      const sg: Record<string, any> = {};
      series.columns.forEach((col: string, i: number) => {
        sg[col] = v[i];
      });
      return sg;
    });
  }

  async getUsers(): Promise<any[]> {
    const result = await this.query('SHOW USERS');
    const series = result.results?.[0]?.series?.[0];
    if (!series) return [];
    return series.values.map((v: any[]) => ({
      user: v[0],
      admin: v[1],
    }));
  }
}

export const client = new TideDBClient();
export default client;
```

### 3.6 App Shell and Routing

`ui/src/App.tsx`:

```tsx
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import QueryExplorer from './pages/QueryExplorer';
import DatabaseAdmin from './pages/DatabaseAdmin';
import WriteData from './pages/WriteData';
import SystemHealth from './pages/SystemHealth';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/explore" replace />} />
        <Route path="/explore" element={<QueryExplorer />} />
        <Route path="/admin" element={<DatabaseAdmin />} />
        <Route path="/write" element={<WriteData />} />
        <Route path="/health" element={<SystemHealth />} />
      </Routes>
    </Layout>
  );
}
```

### 3.7 Layout Component

`ui/src/components/Layout.tsx`:

Build a sidebar navigation layout with these characteristics:

- **Sidebar** (left, 240px wide, dark background `bg-gray-900`):
  - TideDB logo/name at top with version number (fetched from `/ping` header)
  - Navigation links with icons (use `lucide-react` icons):
    - **Explore** (`/explore`) — `Terminal` icon — the query explorer
    - **Admin** (`/admin`) — `Database` icon — database/RP management
    - **Write** (`/write`) — `PenLine` icon — write data interface
    - **Health** (`/health`) — `Activity` icon — system diagnostics
  - Connection status indicator at bottom (green dot = connected, red = disconnected)
  - Credentials input (collapsible) for username/password authentication
- **Main content area** (right, fills remaining space):
  - Renders the active page component via `{children}`

Design notes:

- Use a dark color scheme throughout: `bg-gray-950` for body, `bg-gray-900` for sidebar, `bg-gray-800` for cards/panels
- Active nav link gets `bg-gray-800` background with a left blue border accent
- Responsive: on mobile, sidebar collapses to a hamburger menu

### 3.8 Query Explorer Page

`ui/src/pages/QueryExplorer.tsx`:

This is the most important page. It has a **three-panel layout**:

```
┌──────────────────────────────────────────────────────────┐
│  [Database Dropdown ▼]  [RP Dropdown ▼]  [Epoch ▼]      │
├─────────────┬────────────────────────────────────────────│
│             │  InfluxQL Query Editor (CodeMirror)        │
│  Schema     │  ┌──────────────────────────────────────┐  │
│  Explorer   │  │ SELECT mean("usage_idle")            │  │
│             │  │ FROM "cpu"                           │  │
│  ▸ telegraf │  │ WHERE time > now() - 1h             │  │
│    ▸ autogen│  │ GROUP BY time(5m), "host"           │  │
│      ▸ cpu  │  └──────────────────────────────────────┘  │
│        usage│  [▶ Execute] [Format] [History ▼]          │
│        ...  │────────────────────────────────────────────│
│      ▸ mem  │  Results                                   │
│      ▸ disk │  [Table] [Chart] tabs                      │
│             │                                            │
│    ▸ 30d_rp │  ┌──────────────────────────────────────┐  │
│             │  │ (table or time-series chart here)    │  │
│             │  │                                      │  │
│             │  └──────────────────────────────────────┘  │
│             │  Query took: 23ms | 1,234 rows returned    │
└─────────────┴────────────────────────────────────────────┘
```

**Schema Explorer** (left panel, ~250px):

- Tree structure: Database > Retention Policy > Measurement > Fields/Tags
- Load databases on mount via `SHOW DATABASES`
- Lazy-load children: clicking a database loads RPs via `SHOW RETENTION POLICIES`, clicking RP loads measurements via `SHOW MEASUREMENTS`, clicking measurement loads fields via `SHOW FIELD KEYS` and tags via `SHOW TAG KEYS`
- Clicking on a measurement name inserts it into the query editor
- Clicking on a field name inserts it into the SELECT clause
- Show field types next to field names (float, integer, string, boolean) with color coding

**Query Editor** (top right):

- Use `@uiw/react-codemirror` with SQL language mode
- SQL/InfluxQL syntax highlighting
- Multi-line support
- Keyboard shortcut: Ctrl+Enter / Cmd+Enter to execute
- Execute button runs the query against the selected database
- Format button auto-formats the query (basic indentation)
- History dropdown shows last 30 queries stored in localStorage
- When clicking a schema tree item, intelligently insert into the editor

**Results Panel** (bottom right):

- Two tabs: **Table** and **Chart**
- **Table view**: Render `columns` as headers and `values` as rows. Support sorting by clicking column headers. Show row count.
- **Chart view**: If the results include a `time` column, render a time-series line chart using `recharts`. Each series (unique tag combination) is a separate line. X-axis is time, Y-axis is the value column(s).
- Status bar at bottom: query duration, number of rows, error messages

**State management**:

- Store the current database selection, query text, and results in React state
- Persist query history in `localStorage` (key: `tidedb_query_history`)
- Persist last selected database in `localStorage`

### 3.9 Database Admin Page

`ui/src/pages/DatabaseAdmin.tsx`:

**Three tabs**:

**Tab 1: Databases & Retention Policies**

- Table listing all databases
- For each database, expandable section showing:
  - Retention policies (name, duration, shard group duration, replication factor, default flag)
  - Series cardinality count
  - Buttons: Drop Database (with confirmation modal), Create Retention Policy
- “Create Database” button opens a form:
  - Database name (text input)
  - Default retention policy duration (duration input, e.g., “30d”, “INF”)
  - Execute `CREATE DATABASE "name" WITH DURATION <dur>`

**Tab 2: Continuous Queries**

- List all CQs grouped by database
- Show: name, query text, resample interval
- Buttons: Drop CQ (with confirmation)
- Create CQ form with InfluxQL editor

**Tab 3: Users**

- List all users (name, admin flag)
- Create user form (username, password, admin checkbox)
- Grant/Revoke privileges interface
- Drop user (with confirmation)

### 3.10 Write Data Page

`ui/src/pages/WriteData.tsx`:

Simple interface for writing data:

```
┌─────────────────────────────────────────────────┐
│  Database: [dropdown ▼]   RP: [dropdown ▼]      │
│  Precision: [ns/us/ms/s ▼]                      │
│                                                  │
│  ┌───────────────────────────────────────────┐   │
│  │ cpu,host=server01,region=us-west          │   │
│  │   usage_idle=98.2,usage_system=1.3        │   │
│  │   1622505600000000000                     │   │
│  │                                           │   │
│  │ (enter line protocol here)                │   │
│  └───────────────────────────────────────────┘   │
│                                                  │
│  [Write Data]  [Upload File]  [Clear]            │
│                                                  │
│  Status: ✅ 3 points written successfully        │
└─────────────────────────────────────────────────┘
```

Features:

- CodeMirror editor for line protocol input (plain text mode)
- Database and RP dropdowns populated from the API
- Precision selector (nanoseconds, microseconds, milliseconds, seconds)
- Write button sends data to `/write` endpoint
- File upload: accept `.txt` or `.lp` files, load contents into editor
- Validation: basic line protocol syntax checking before sending
- Success/error feedback with details

### 3.11 System Health Page

`ui/src/pages/SystemHealth.tsx`:

Dashboard showing server diagnostics. Fetches data from `/debug/vars`, `SHOW DIAGNOSTICS`, and `SHOW STATS`.

**Sections**:

**Server Info** (top cards row):

- Version, uptime, Go version, OS/Arch
- Current time, PID
- Fetched from `SHOW DIAGNOSTICS`

**Performance Metrics** (live-updating charts, auto-refresh every 5 seconds):

- Points written per second (from `SHOW STATS` → `write` → `pointReq`)
- Queries executed per second
- Active write/query requests
- Use `recharts` line charts, keep last 60 data points (5 min of history)

**Storage** (table):

- Per-database: number of measurements, series cardinality, number of shards
- Disk size if available from debug vars

**Active Queries** (table):

- Running queries with: query ID, database, query text, duration
- Kill button per query (calls `KILL QUERY <id>`)
- Auto-refresh every 3 seconds

**Shard Groups** (table):

- ID, Database, RP, Start Time, End Time, Expiry Time
- From `SHOW SHARD GROUPS`

**Continuous Queries** (summary):

- Count of CQs per database
- Last execution time if available

-----

## Part 4: Go Server Integration

### 4.1 Register UI Routes

Modify `services/httpd/handler.go` to serve the embedded UI.

Find the `NewHandler` function where routes are registered. Add UI routes:

```go
import (
    "io/fs"
    "net/http"
    tidedb "github.com/<your-username>/tidedb"  // import root package for UIAssets
)

// In the NewHandler function or route registration, add:

// Serve embedded UI assets
uiFS, err := fs.Sub(tidedb.UIAssets, "ui/dist")
if err != nil {
    // handle error — this should not happen if built correctly
    panic("failed to locate embedded UI assets: " + err.Error())
}

// File server for UI static assets
uiFileServer := http.FileServer(http.FS(uiFS))

// Register the UI route
// Serve /ui/ and all sub-paths
h.mux.Handle("/ui/", http.StripPrefix("/ui/", uiFileServer))

// SPA fallback: for any /ui/* path that doesn't match a file, 
// serve index.html so React Router can handle client-side routing
h.mux.HandleFunc("/ui/", func(w http.ResponseWriter, r *http.Request) {
    // Try to serve the actual file first
    path := r.URL.Path[len("/ui/"):]
    if path == "" {
        path = "index.html"
    }
    
    // Check if file exists in embedded FS
    f, err := uiFS.Open(path)
    if err == nil {
        f.Close()
        uiFileServer.ServeHTTP(w, r)
        return
    }
    
    // File doesn't exist — serve index.html for SPA routing
    indexFile, err := uiFS.Open("index.html")
    if err != nil {
        http.Error(w, "UI not available", 500)
        return
    }
    defer indexFile.Close()
    
    stat, _ := indexFile.Stat()
    content, _ := io.ReadAll(indexFile)
    http.ServeContent(w, r, "index.html", stat.ModTime(), bytes.NewReader(content))
})

// Redirect root /ui to /ui/
h.mux.HandleFunc("/ui", func(w http.ResponseWriter, r *http.Request) {
    http.Redirect(w, r, "/ui/", http.StatusMovedPermanently)
})
```

### 4.2 CORS Configuration

The existing InfluxDB 1.x handler already has CORS support. Ensure it covers the UI paths. If developing the UI with `vite dev` (separate port), the proxy in vite.config.ts handles this. In production (embedded), CORS isn’t needed since everything is same-origin.

### 4.3 Add UI Disable Configuration Option

In the config file (`etc/config.sample.toml` and `services/httpd/config.go`):

```toml
[http]
  # Enable the embedded web UI
  ui-enabled = true
```

```go
// In services/httpd/config.go, add to the Config struct:
type Config struct {
    // ... existing fields ...
    UIEnabled bool `toml:"ui-enabled"`
}

// Default to true
func NewConfig() Config {
    return Config{
        // ... existing defaults ...
        UIEnabled: true,
    }
}
```

Only register the UI routes if `UIEnabled` is true.

### 4.4 Startup Banner

Modify the startup log output to include the UI URL:

```go
// In cmd/tided/run/server.go or equivalent startup code
log.Printf("TideDB %s starting", branding.Version)
log.Printf("  HTTP API: http://%s", httpAddr)
if config.HTTPD.UIEnabled {
    log.Printf("  Web UI:   http://%s/ui/", httpAddr)
}
```

-----

## Part 5: Build System

### 5.1 Makefile Updates

Add UI build targets to the Makefile:

```makefile
# UI build
.PHONY: ui ui-install ui-clean

UI_DIR = ui

ui-install:
	cd $(UI_DIR) && npm install

ui: ui-install
	cd $(UI_DIR) && npm run build

ui-clean:
	rm -rf $(UI_DIR)/dist $(UI_DIR)/node_modules

# Main build (now depends on UI)
build: ui
	go build $(LDFLAGS) -o bin/tided ./cmd/tided
	go build $(LDFLAGS) -o bin/tide ./cmd/tide
	go build $(LDFLAGS) -o bin/tide_inspect ./cmd/tide_inspect

# Dev build without UI (for backend-only changes)
build-server:
	go build $(LDFLAGS) -o bin/tided ./cmd/tided

# Full clean
clean: ui-clean
	rm -rf bin/

# Docker build
docker:
	docker build -t tidedb:$(VERSION) .

# Run tests
test:
	go test ./...

# Development mode: run UI dev server + Go server concurrently
dev:
	@echo "Starting TideDB server on :8086..."
	@go run ./cmd/tided run &
	@echo "Starting UI dev server on :5173..."
	@cd $(UI_DIR) && npm run dev
```

### 5.2 Dockerfile

```dockerfile
# Stage 1: Build UI
FROM node:20-alpine AS ui-builder
WORKDIR /ui
COPY ui/package*.json ./
RUN npm ci
COPY ui/ .
RUN npm run build

# Stage 2: Build Go binary
FROM golang:1.23-alpine AS go-builder
RUN apk add --no-cache git gcc musl-dev
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=ui-builder /ui/dist ./ui/dist
RUN go build -o /tided ./cmd/tided
RUN go build -o /tide ./cmd/tide

# Stage 3: Runtime
FROM alpine:3.19
RUN apk add --no-cache ca-certificates tzdata
COPY --from=go-builder /tided /usr/bin/tided
COPY --from=go-builder /tide /usr/bin/tide
EXPOSE 8086
VOLUME /var/lib/tidedb
ENTRYPOINT ["tided"]
CMD ["run"]
```

### 5.3 GitHub Actions CI

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: ui/package-lock.json

      - uses: actions/setup-go@v5
        with:
          go-version: '1.23'

      - name: Build UI
        run: |
          cd ui
          npm ci
          npm run build

      - name: Build Server
        run: go build ./cmd/tided

      - name: Run Go Tests
        run: go test ./...

      - name: Verify UI is embedded
        run: |
          ./tided run &
          sleep 3
          curl -sf http://localhost:8086/ui/ | grep -q "TideDB" || (echo "UI not serving" && exit 1)
          curl -sf http://localhost:8086/ping
          kill %1
```

-----

## Part 6: UI Design Specifications

### 6.1 Color Palette

Use a dark theme consistent with observability tools:

```
Background (body):     #030712  (gray-950)
Background (sidebar):  #111827  (gray-900)
Background (cards):    #1f2937  (gray-800)
Background (inputs):   #374151  (gray-700)
Border:                #4b5563  (gray-600)
Text (primary):        #f9fafb  (gray-50)
Text (secondary):      #9ca3af  (gray-400)
Text (muted):          #6b7280  (gray-500)
Accent (primary):      #3b82f6  (blue-500)
Accent (hover):        #2563eb  (blue-600)
Success:               #22c55e  (green-500)
Warning:               #f59e0b  (amber-500)
Error:                 #ef4444  (red-500)
Chart line colors:     #3b82f6, #8b5cf6, #ec4899, #f59e0b, #22c55e, #06b6d4
```

### 6.2 Typography

- Font: system font stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', ...`) via Tailwind defaults
- Monospace (for queries, line protocol): `'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace`
- Use `font-mono` Tailwind class for all code/query text

### 6.3 Component Styling Guidelines

- Cards: `bg-gray-800 rounded-lg border border-gray-700 p-4`
- Buttons primary: `bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium`
- Buttons danger: `bg-red-600 hover:bg-red-700 text-white ...`
- Buttons secondary: `bg-gray-700 hover:bg-gray-600 text-gray-200 ...`
- Inputs: `bg-gray-700 border border-gray-600 text-gray-100 rounded-md px-3 py-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500`
- Dropdowns: same as inputs with a chevron icon
- Tables: `border-collapse` with `border-b border-gray-700` between rows, `bg-gray-800` header row
- No shadows on cards (flat design)
- Subtle transitions: `transition-colors duration-150`

### 6.4 Responsive Behavior

- Minimum supported width: 1024px (this is a database admin tool, not a mobile app)
- Sidebar collapses to icons only below 1280px
- Schema explorer panel can be toggled on/off with a button
- Results panel is resizable (drag handle between editor and results)

-----

## Part 7: Development Workflow

### 7.1 First-Time Setup

```bash
# Clone your fork
git clone git@github.com:<your-username>/tidedb.git
cd tidedb

# Install Go dependencies
go mod download

# Install UI dependencies
cd ui && npm install && cd ..

# Build everything
make build

# Run
./bin/tided run
# Open http://localhost:8086/ui/
```

### 7.2 UI Development Mode

For fast UI iteration with hot-reload:

```bash
# Terminal 1: Run the Go server
go run ./cmd/tided run

# Terminal 2: Run Vite dev server with proxy to Go server
cd ui && npm run dev
# Open http://localhost:5173/ui/
```

Vite proxies API requests (`/query`, `/write`, `/ping`, `/debug`) to `localhost:8086`, so the UI works against the real server.

### 7.3 Testing the Embedded Build

```bash
# Build with UI embedded
make build

# Start server
./bin/tided run

# Verify UI is served from the binary
curl -s http://localhost:8086/ui/ | head -5
# Should contain HTML with "TideDB" in the title

# Verify API still works
curl -s 'http://localhost:8086/query?q=SHOW+DATABASES' | python3 -m json.tool
```

-----

## Part 8: README.md

Create a README that positions TideDB clearly:

```markdown
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
\`\`\`bash
./tided run
# API: http://localhost:8086
# UI:  http://localhost:8086/ui/
\`\`\`

### Docker

\`\`\`bash
docker run -p 8086:8086 tidedb/tidedb:latest
\`\`\`

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
```

-----

## Execution Order for Claude Code

When giving this to Claude Code, execute in this order:

1. **Fork and clone** the repository (Section 1.1)
1. **Add license/notice files** (Section 1.2)
1. **Rename Go module** (Section 1.3)
1. **Rename binaries** (Section 1.4)
1. **Add branding package** (Section 1.5)
1. **Verify build** (Section 1.6)
1. **Create UI project** with Vite + React + TypeScript (Section 3.1-3.2)
1. **Implement API client** (Section 3.5)
1. **Implement Layout component** (Section 3.7)
1. **Implement Query Explorer** (Section 3.8) — this is the most complex page
1. **Implement Database Admin** (Section 3.9)
1. **Implement Write Data** (Section 3.10)
1. **Implement System Health** (Section 3.11)
1. **Add Go embed directive** (Section 2.3)
1. **Register UI routes in Go server** (Section 4.1-4.3)
1. **Update Makefile** (Section 5.1)
1. **Add Dockerfile** (Section 5.2)
1. **Add CI** (Section 5.3)
1. **Write README** (Section 8)
1. **Test the full build end-to-end** (Section 7.3)

-----

## Notes for Claude Code

- The InfluxDB 1.x codebase is in **Go**. The UI is in **React + TypeScript**.
- The Go codebase uses **Go 1.23** (as of v1.12.2).
- All UI API calls go through the existing InfluxDB HTTP API — no new Go endpoints needed for the UI.
- The query API endpoint is `POST /query?q=<InfluxQL>&db=<database>` — it returns JSON.
- The write API endpoint is `POST /write?db=<database>&precision=<precision>` — body is line protocol.
- The `/ping` endpoint returns server version in headers.
- The `/debug/vars` endpoint returns Go runtime and engine statistics as JSON.
- Do NOT modify any existing InfluxDB query engine, storage engine, or protocol handling code for this phase.
- The UI is strictly a **consumer of existing APIs**.
- Keep the UI bundle size small — do not add heavy dependencies. Target < 500KB gzipped for the initial load.
