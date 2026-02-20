// Mock data fixtures for Playground mode.
// Generates realistic-looking timeseries data without hitting any real backend.

// ── Helpers ──────────────────────────────────────────────────────────────────

function now(): number {
  return Date.now();
}

function rfc3339(ts: number): string {
  return new Date(ts).toISOString();
}

function sinWave(base: number, amplitude: number, period: number, ts: number, noise = 0): number {
  const v = base + amplitude * Math.sin((2 * Math.PI * ts) / period);
  return Math.round((v + (Math.random() - 0.5) * noise) * 100) / 100;
}

function generateTimeValues(
  startMs: number,
  endMs: number,
  stepMs: number,
  fn: (ts: number) => number[],
  _columns?: string[],
): any[][] {
  const values: any[][] = [];
  for (let t = startMs; t <= endMs; t += stepMs) {
    values.push([rfc3339(t), ...fn(t)]);
  }
  return values;
}

// ── InfluxDB Mock Data ──────────────────────────────────────────────────────

export const INFLUX_DATABASES = ['telegraf', 'app_metrics', 'iot_sensors', '_internal'];

export const INFLUX_MEASUREMENTS: Record<string, string[]> = {
  telegraf: ['cpu', 'mem', 'disk', 'diskio', 'net', 'system', 'swap'],
  app_metrics: ['http_requests', 'response_time', 'active_users', 'error_rate'],
  iot_sensors: ['temperature', 'humidity', 'pressure', 'battery_level'],
  _internal: ['database', 'httpd', 'queryExecutor', 'runtime', 'shard', 'tsm1_engine'],
};

export const INFLUX_TAG_KEYS: Record<string, string[]> = {
  cpu: ['host', 'cpu'],
  mem: ['host'],
  disk: ['host', 'path', 'device', 'fstype'],
  diskio: ['host', 'name'],
  net: ['host', 'interface'],
  system: ['host'],
  swap: ['host'],
  http_requests: ['method', 'status', 'endpoint'],
  response_time: ['endpoint', 'method'],
  active_users: ['region'],
  error_rate: ['service', 'severity'],
  temperature: ['sensor_id', 'location', 'building'],
  humidity: ['sensor_id', 'location'],
  pressure: ['sensor_id', 'location'],
  battery_level: ['sensor_id', 'device_type'],
};

export const INFLUX_FIELD_KEYS: Record<string, Array<{ key: string; type: string }>> = {
  cpu: [
    { key: 'usage_user', type: 'float' },
    { key: 'usage_system', type: 'float' },
    { key: 'usage_idle', type: 'float' },
    { key: 'usage_iowait', type: 'float' },
  ],
  mem: [
    { key: 'used_percent', type: 'float' },
    { key: 'available', type: 'integer' },
    { key: 'total', type: 'integer' },
    { key: 'used', type: 'integer' },
  ],
  disk: [
    { key: 'used_percent', type: 'float' },
    { key: 'free', type: 'integer' },
    { key: 'total', type: 'integer' },
  ],
  http_requests: [
    { key: 'count', type: 'integer' },
    { key: 'duration_ms', type: 'float' },
  ],
  response_time: [
    { key: 'p50', type: 'float' },
    { key: 'p95', type: 'float' },
    { key: 'p99', type: 'float' },
  ],
  temperature: [
    { key: 'value', type: 'float' },
  ],
  humidity: [
    { key: 'value', type: 'float' },
  ],
  pressure: [
    { key: 'value', type: 'float' },
  ],
  battery_level: [
    { key: 'percent', type: 'float' },
  ],
};

export const INFLUX_RETENTION_POLICIES: Record<string, any[]> = {
  telegraf: [
    { name: 'autogen', duration: '0s', shardGroupDuration: '168h0m0s', replicaN: 1, default: true },
    { name: '30d', duration: '720h0m0s', shardGroupDuration: '24h0m0s', replicaN: 1, default: false },
  ],
  app_metrics: [
    { name: 'autogen', duration: '0s', shardGroupDuration: '168h0m0s', replicaN: 1, default: true },
  ],
  iot_sensors: [
    { name: 'autogen', duration: '0s', shardGroupDuration: '168h0m0s', replicaN: 1, default: true },
    { name: '90d', duration: '2160h0m0s', shardGroupDuration: '24h0m0s', replicaN: 1, default: false },
  ],
  _internal: [
    { name: 'monitor', duration: '168h0m0s', shardGroupDuration: '24h0m0s', replicaN: 1, default: true },
  ],
};

export const INFLUX_USERS = [
  { user: 'admin', admin: true },
  { user: 'grafana_reader', admin: false },
  { user: 'telegraf_writer', admin: false },
];

export const INFLUX_CONTINUOUS_QUERIES = [
  {
    name: '_internal',
    columns: ['name', 'query'],
    values: [],
  },
  {
    name: 'telegraf',
    columns: ['name', 'query'],
    values: [
      ['cq_cpu_5m', 'CREATE CONTINUOUS QUERY cq_cpu_5m ON telegraf BEGIN SELECT mean(usage_user) AS mean_usage_user INTO telegraf."30d".cpu_5m FROM cpu GROUP BY time(5m), host END'],
    ],
  },
];

/** Generate a SELECT query result with time-series data. */
export function generateInfluxQueryResult(queryStr: string, db?: string): any {
  const q = queryStr.toUpperCase().trim();

  // SHOW DATABASES
  if (q.startsWith('SHOW DATABASES')) {
    return {
      results: [{
        statement_id: 0,
        series: [{ name: 'databases', columns: ['name'], values: INFLUX_DATABASES.map((d) => [d]) }],
      }],
    };
  }

  // SHOW MEASUREMENTS
  if (q.startsWith('SHOW MEASUREMENTS')) {
    const measurements = (db && INFLUX_MEASUREMENTS[db]) || INFLUX_MEASUREMENTS.telegraf;
    return {
      results: [{
        statement_id: 0,
        series: [{ name: 'measurements', columns: ['name'], values: measurements.map((m) => [m]) }],
      }],
    };
  }

  // SHOW TAG KEYS
  if (q.startsWith('SHOW TAG KEYS')) {
    const match = queryStr.match(/FROM\s+"?(\w+)"?/i);
    const measurement = match?.[1] || 'cpu';
    const tags = INFLUX_TAG_KEYS[measurement] || ['host'];
    return {
      results: [{
        statement_id: 0,
        series: [{ name: measurement, columns: ['tagKey'], values: tags.map((t) => [t]) }],
      }],
    };
  }

  // SHOW TAG VALUES
  if (q.includes('SHOW TAG VALUES')) {
    const keyMatch = queryStr.match(/WITH\s+KEY\s*=\s*"?(\w+)"?/i);
    const key = keyMatch?.[1] || 'host';
    const valMap: Record<string, string[]> = {
      host: ['web-server-01', 'web-server-02', 'db-server-01', 'worker-01'],
      cpu: ['cpu-total', 'cpu0', 'cpu1', 'cpu2', 'cpu3'],
      region: ['us-east-1', 'us-west-2', 'eu-west-1'],
      sensor_id: ['sensor-001', 'sensor-002', 'sensor-003', 'sensor-004'],
      location: ['floor-1', 'floor-2', 'floor-3', 'warehouse'],
      method: ['GET', 'POST', 'PUT', 'DELETE'],
      status: ['200', '201', '301', '404', '500'],
      endpoint: ['/api/users', '/api/products', '/api/orders', '/health'],
      building: ['HQ', 'Warehouse-A', 'Warehouse-B'],
    };
    const values = valMap[key] || ['value-1', 'value-2'];
    return {
      results: [{
        statement_id: 0,
        series: [{
          name: key,
          columns: ['key', 'value'],
          values: values.map((v) => [key, v]),
        }],
      }],
    };
  }

  // SHOW FIELD KEYS
  if (q.startsWith('SHOW FIELD KEYS')) {
    const match = queryStr.match(/FROM\s+"?(\w+)"?/i);
    const measurement = match?.[1] || 'cpu';
    const fields = INFLUX_FIELD_KEYS[measurement] || [{ key: 'value', type: 'float' }];
    return {
      results: [{
        statement_id: 0,
        series: [{ name: measurement, columns: ['fieldKey', 'fieldType'], values: fields.map((f) => [f.key, f.type]) }],
      }],
    };
  }

  // SHOW RETENTION POLICIES
  if (q.startsWith('SHOW RETENTION POLICIES') || q.startsWith('SHOW RETENTION')) {
    const rps = (db && INFLUX_RETENTION_POLICIES[db]) || INFLUX_RETENTION_POLICIES.telegraf;
    return {
      results: [{
        statement_id: 0,
        series: [{
          name: 'results',
          columns: ['name', 'duration', 'shardGroupDuration', 'replicaN', 'default'],
          values: rps.map((rp) => [rp.name, rp.duration, rp.shardGroupDuration, rp.replicaN, rp.default]),
        }],
      }],
    };
  }

  // SHOW SERIES CARDINALITY
  if (q.includes('SERIES CARDINALITY') || q.includes('SERIES EXACT CARDINALITY')) {
    return {
      results: [{
        statement_id: 0,
        series: [{ columns: ['count'], values: [[4287]] }],
      }],
    };
  }

  // SHOW USERS
  if (q.startsWith('SHOW USERS')) {
    return {
      results: [{
        statement_id: 0,
        series: [{
          columns: ['user', 'admin'],
          values: INFLUX_USERS.map((u) => [u.user, u.admin]),
        }],
      }],
    };
  }

  // SHOW GRANTS
  if (q.startsWith('SHOW GRANTS')) {
    return {
      results: [{
        statement_id: 0,
        series: [{
          columns: ['database', 'privilege'],
          values: [['telegraf', 'ALL PRIVILEGES'], ['app_metrics', 'READ']],
        }],
      }],
    };
  }

  // SHOW QUERIES
  if (q.startsWith('SHOW QUERIES')) {
    return {
      results: [{
        statement_id: 0,
        series: [{
          columns: ['qid', 'query', 'database', 'duration'],
          values: [
            [1, 'SELECT mean(usage_user) FROM cpu WHERE time > now() - 1h GROUP BY time(1m)', 'telegraf', '2ms'],
          ],
        }],
      }],
    };
  }

  // SHOW CONTINUOUS QUERIES
  if (q.startsWith('SHOW CONTINUOUS QUERIES') || q.startsWith('SHOW CONTINUOUS')) {
    return { results: [{ statement_id: 0, series: INFLUX_CONTINUOUS_QUERIES }] };
  }

  // SHOW SHARD GROUPS
  if (q.includes('SHARD GROUPS') || q.includes('SHARD')) {
    return {
      results: [{
        statement_id: 0,
        series: [{
          columns: ['id', 'database', 'retention_policy', 'start_time', 'end_time', 'expiry_time'],
          values: [
            [1, 'telegraf', 'autogen', rfc3339(now() - 7 * 86400000), rfc3339(now()), rfc3339(now() + 7 * 86400000)],
            [2, 'telegraf', '30d', rfc3339(now() - 86400000), rfc3339(now()), rfc3339(now() + 30 * 86400000)],
          ],
        }],
      }],
    };
  }

  // SHOW SUBSCRIPTIONS
  if (q.includes('SUBSCRIPTIONS')) {
    return { results: [{ statement_id: 0, series: [] }] };
  }

  // SHOW DIAGNOSTICS
  if (q.includes('DIAGNOSTICS')) {
    return {
      results: [{
        statement_id: 0,
        series: [
          {
            name: 'system',
            columns: ['PID', 'currentTime', 'started', 'uptime'],
            rows: [[12345, rfc3339(now()), rfc3339(now() - 86400000 * 3), '72h15m32s']],
          },
          {
            name: 'build',
            columns: ['Branch', 'Commit', 'Version'],
            rows: [['main', 'abc1234', '1.8.10']],
          },
          {
            name: 'runtime',
            columns: ['GOARCH', 'GOMAXPROCS', 'GOOS', 'version'],
            rows: [['amd64', 4, 'linux', 'go1.21.6']],
          },
          {
            name: 'network',
            columns: ['hostname'],
            rows: [['playground-server']],
          },
        ],
      }],
    };
  }

  // SHOW STATS
  if (q.includes('STATS')) {
    return {
      results: [{
        statement_id: 0,
        series: [
          { name: 'queryExecutor', columns: ['queriesActive', 'queriesExecuted', 'queriesFinished', 'queryDurationNs', 'recoveredPanics'], values: [[1, 47821, 47820, 1203847291, 0]] },
          { name: 'httpd', columns: ['auth', 'clientError', 'pingReq', 'pointsWrittenOK', 'queryReq', 'queryReqDurationNs', 'recoveredPanics', 'req', 'serverError', 'statusReq', 'writeReq', 'writeReqDurationNs'], values: [[0, 12, 9481, 2847193, 47821, 9381274010, 0, 57314, 0, 0, 9481, 4827391023]] },
          { name: 'write', columns: ['pointReq', 'pointReqLocal', 'req', 'subWriteOk', 'writeOk'], values: [[2847193, 2847193, 9481, 9481, 9481]] },
          { name: 'database', tags: { database: 'telegraf' }, columns: ['numMeasurements', 'numSeries'], values: [[7, 3142]] },
          { name: 'database', tags: { database: 'app_metrics' }, columns: ['numMeasurements', 'numSeries'], values: [[4, 847]] },
          { name: 'database', tags: { database: 'iot_sensors' }, columns: ['numMeasurements', 'numSeries'], values: [[4, 298]] },
        ],
      }],
    };
  }

  // SELECT queries — generate time-series data
  const end = now();
  const start = end - 3600000; // 1h default
  const step = 10000; // 10s

  // Try to detect measurement from query
  const fromMatch = queryStr.match(/FROM\s+"?(\w+)"?/i);
  const measurement = fromMatch?.[1] || 'cpu';

  if (measurement === 'cpu' || q.includes('USAGE')) {
    return {
      results: [{
        statement_id: 0,
        series: [
          {
            name: 'cpu',
            tags: { host: 'web-server-01', cpu: 'cpu-total' },
            columns: ['time', 'usage_user', 'usage_system', 'usage_idle'],
            values: generateTimeValues(start, end, step, (t) => [
              sinWave(35, 15, 600000, t, 5),
              sinWave(8, 4, 900000, t, 2),
              sinWave(55, 15, 600000, t + 300000, 5),
            ], ['usage_user', 'usage_system', 'usage_idle']),
          },
          {
            name: 'cpu',
            tags: { host: 'web-server-02', cpu: 'cpu-total' },
            columns: ['time', 'usage_user', 'usage_system', 'usage_idle'],
            values: generateTimeValues(start, end, step, (t) => [
              sinWave(25, 10, 500000, t + 100000, 4),
              sinWave(5, 3, 800000, t + 200000, 2),
              sinWave(68, 10, 500000, t, 4),
            ], ['usage_user', 'usage_system', 'usage_idle']),
          },
        ],
      }],
    };
  }

  if (measurement === 'mem' || q.includes('MEM')) {
    return {
      results: [{
        statement_id: 0,
        series: [{
          name: 'mem',
          tags: { host: 'web-server-01' },
          columns: ['time', 'used_percent'],
          values: generateTimeValues(start, end, step, (t) => [
            sinWave(62, 8, 1800000, t, 3),
          ], ['used_percent']),
        }],
      }],
    };
  }

  if (measurement === 'http_requests' || q.includes('HTTP')) {
    return {
      results: [{
        statement_id: 0,
        series: [{
          name: 'http_requests',
          tags: { method: 'GET', endpoint: '/api/users' },
          columns: ['time', 'count', 'duration_ms'],
          values: generateTimeValues(start, end, step, (t) => [
            Math.round(sinWave(120, 40, 900000, t, 20)),
            sinWave(45, 15, 600000, t, 10),
          ], ['count', 'duration_ms']),
        }],
      }],
    };
  }

  if (measurement === 'temperature' || q.includes('TEMPERATURE')) {
    return {
      results: [{
        statement_id: 0,
        series: [
          {
            name: 'temperature',
            tags: { sensor_id: 'sensor-001', location: 'floor-1' },
            columns: ['time', 'value'],
            values: generateTimeValues(start, end, step, (t) => [
              sinWave(22.5, 2.5, 3600000, t, 0.5),
            ], ['value']),
          },
          {
            name: 'temperature',
            tags: { sensor_id: 'sensor-002', location: 'floor-2' },
            columns: ['time', 'value'],
            values: generateTimeValues(start, end, step, (t) => [
              sinWave(21.0, 1.5, 3600000, t + 900000, 0.3),
            ], ['value']),
          },
        ],
      }],
    };
  }

  // Generic fallback
  return {
    results: [{
      statement_id: 0,
      series: [{
        name: measurement,
        columns: ['time', 'value'],
        values: generateTimeValues(start, end, step, (t) => [
          sinWave(50, 20, 900000, t, 5),
        ], ['value']),
      }],
    }],
  };
}

// ── Prometheus / VictoriaMetrics Mock Data ────────────────────────────────────

export const PROM_METRIC_NAMES = [
  'up', 'process_cpu_seconds_total', 'process_resident_memory_bytes',
  'http_requests_total', 'http_request_duration_seconds_bucket',
  'http_request_duration_seconds_sum', 'http_request_duration_seconds_count',
  'go_goroutines', 'go_memstats_alloc_bytes', 'go_gc_duration_seconds',
  'node_cpu_seconds_total', 'node_memory_MemTotal_bytes', 'node_memory_MemAvailable_bytes',
  'node_filesystem_avail_bytes', 'node_network_receive_bytes_total',
  'prometheus_tsdb_head_series', 'prometheus_tsdb_head_chunks',
  'prometheus_engine_query_duration_seconds', 'prometheus_http_requests_total',
  'scrape_duration_seconds', 'scrape_samples_scraped',
];

export const PROM_LABELS = [
  '__name__', 'instance', 'job', 'method', 'handler', 'code', 'le',
  'quantile', 'cpu', 'mode', 'device', 'mountpoint', 'fstype',
];

export function generatePromInstantResult(query: string): any {
  const ts = Math.floor(now() / 1000);

  if (query === 'up' || query.startsWith('up')) {
    return {
      status: 'success',
      data: {
        resultType: 'vector',
        result: [
          { metric: { __name__: 'up', instance: 'localhost:9090', job: 'prometheus' }, value: [ts, '1'] },
          { metric: { __name__: 'up', instance: 'web-01:9100', job: 'node' }, value: [ts, '1'] },
          { metric: { __name__: 'up', instance: 'web-02:9100', job: 'node' }, value: [ts, '1'] },
          { metric: { __name__: 'up', instance: 'db-01:9100', job: 'node' }, value: [ts, '0'] },
        ],
      },
    };
  }

  if (query.includes('http_requests_total')) {
    return {
      status: 'success',
      data: {
        resultType: 'vector',
        result: [
          { metric: { __name__: 'http_requests_total', method: 'GET', code: '200', handler: '/api/v1/query' }, value: [ts, '48271'] },
          { metric: { __name__: 'http_requests_total', method: 'POST', code: '200', handler: '/api/v1/write' }, value: [ts, '12483'] },
          { metric: { __name__: 'http_requests_total', method: 'GET', code: '404', handler: '/api/v1/query' }, value: [ts, '37'] },
          { metric: { __name__: 'http_requests_total', method: 'GET', code: '500', handler: '/api/v1/query' }, value: [ts, '3'] },
        ],
      },
    };
  }

  // Generic instant result
  return {
    status: 'success',
    data: {
      resultType: 'vector',
      result: [
        { metric: { __name__: query.split(/[({]/)[0], instance: 'localhost:9090', job: 'prometheus' }, value: [ts, String(Math.round(Math.random() * 1000) / 10)] },
      ],
    },
  };
}

export function generatePromRangeResult(query: string, startSec: number, endSec: number, stepSec: number): any {
  const buildValues = (baseFn: (t: number) => number): [number, string][] => {
    const vals: [number, string][] = [];
    for (let t = startSec; t <= endSec; t += stepSec) {
      vals.push([t, String(Math.round(baseFn(t) * 100) / 100)]);
    }
    return vals;
  };

  if (query === 'up' || query.startsWith('up')) {
    return {
      status: 'success',
      data: {
        resultType: 'matrix',
        result: [
          { metric: { __name__: 'up', instance: 'localhost:9090', job: 'prometheus' }, values: buildValues(() => 1) },
          { metric: { __name__: 'up', instance: 'web-01:9100', job: 'node' }, values: buildValues(() => 1) },
          { metric: { __name__: 'up', instance: 'web-02:9100', job: 'node' }, values: buildValues(() => 1) },
          { metric: { __name__: 'up', instance: 'db-01:9100', job: 'node' }, values: buildValues((t) => t > (endSec - (endSec - startSec) * 0.3) ? 0 : 1) },
        ],
      },
    };
  }

  if (query.includes('rate') || query.includes('http')) {
    return {
      status: 'success',
      data: {
        resultType: 'matrix',
        result: [
          { metric: { method: 'GET', code: '200', handler: '/api/v1/query' }, values: buildValues((t) => sinWave(45, 20, 600, t, 5)) },
          { metric: { method: 'POST', code: '200', handler: '/api/v1/write' }, values: buildValues((t) => sinWave(15, 8, 900, t, 3)) },
        ],
      },
    };
  }

  if (query.includes('cpu') || query.includes('process_cpu')) {
    return {
      status: 'success',
      data: {
        resultType: 'matrix',
        result: [
          { metric: { instance: 'web-01:9100', job: 'node' }, values: buildValues((t) => sinWave(0.35, 0.15, 600, t, 0.05)) },
          { metric: { instance: 'web-02:9100', job: 'node' }, values: buildValues((t) => sinWave(0.25, 0.10, 500, t, 0.04)) },
        ],
      },
    };
  }

  if (query.includes('memory') || query.includes('mem')) {
    return {
      status: 'success',
      data: {
        resultType: 'matrix',
        result: [
          { metric: { instance: 'web-01:9100', job: 'node' }, values: buildValues((t) => sinWave(4.2e9, 3e8, 1800, t, 1e8)) },
          { metric: { instance: 'web-02:9100', job: 'node' }, values: buildValues((t) => sinWave(3.1e9, 2e8, 1200, t, 8e7)) },
        ],
      },
    };
  }

  // Generic range result
  return {
    status: 'success',
    data: {
      resultType: 'matrix',
      result: [
        { metric: { __name__: query.split(/[({]/)[0], instance: 'localhost:9090' }, values: buildValues((t) => sinWave(50, 20, 900, t, 5)) },
      ],
    },
  };
}

export const PROM_TARGETS = {
  status: 'success',
  data: {
    activeTargets: [
      {
        discoveredLabels: { __address__: 'localhost:9090', __scheme__: 'http', job: 'prometheus' },
        labels: { instance: 'localhost:9090', job: 'prometheus' },
        scrapePool: 'prometheus',
        scrapeUrl: 'http://localhost:9090/metrics',
        globalUrl: 'http://playground-server:9090/metrics',
        lastError: '',
        lastScrape: rfc3339(now() - 5000),
        lastScrapeDuration: 0.012,
        health: 'up' as const,
        scrapeInterval: '15s',
        scrapeTimeout: '10s',
      },
      {
        discoveredLabels: { __address__: 'web-01:9100', __scheme__: 'http', job: 'node' },
        labels: { instance: 'web-01:9100', job: 'node' },
        scrapePool: 'node',
        scrapeUrl: 'http://web-01:9100/metrics',
        globalUrl: 'http://web-01:9100/metrics',
        lastError: '',
        lastScrape: rfc3339(now() - 8000),
        lastScrapeDuration: 0.025,
        health: 'up' as const,
        scrapeInterval: '15s',
        scrapeTimeout: '10s',
      },
      {
        discoveredLabels: { __address__: 'web-02:9100', __scheme__: 'http', job: 'node' },
        labels: { instance: 'web-02:9100', job: 'node' },
        scrapePool: 'node',
        scrapeUrl: 'http://web-02:9100/metrics',
        globalUrl: 'http://web-02:9100/metrics',
        lastError: '',
        lastScrape: rfc3339(now() - 3000),
        lastScrapeDuration: 0.018,
        health: 'up' as const,
        scrapeInterval: '15s',
        scrapeTimeout: '10s',
      },
      {
        discoveredLabels: { __address__: 'db-01:9100', __scheme__: 'http', job: 'node' },
        labels: { instance: 'db-01:9100', job: 'node' },
        scrapePool: 'node',
        scrapeUrl: 'http://db-01:9100/metrics',
        globalUrl: 'http://db-01:9100/metrics',
        lastError: 'connection refused',
        lastScrape: rfc3339(now() - 2000),
        lastScrapeDuration: 0,
        health: 'down' as const,
        scrapeInterval: '15s',
        scrapeTimeout: '10s',
      },
    ],
    droppedTargets: [
      { discoveredLabels: { __address__: 'old-server:9100', job: 'node' } },
    ],
  },
};

export const PROM_RULES = {
  status: 'success',
  data: {
    groups: [
      {
        name: 'node_alerts',
        file: '/etc/prometheus/rules/node.yml',
        rules: [
          {
            state: 'firing' as const,
            name: 'InstanceDown',
            query: 'up == 0',
            duration: 300,
            labels: { severity: 'critical' },
            annotations: { summary: 'Instance {{ $labels.instance }} is down', description: 'Instance has been unreachable for more than 5 minutes.' },
            alerts: [
              { labels: { instance: 'db-01:9100', job: 'node', severity: 'critical' }, annotations: { summary: 'Instance db-01:9100 is down' }, state: 'firing', activeAt: rfc3339(now() - 600000), value: '0' },
            ],
            health: 'ok',
            type: 'alerting' as const,
            evaluationTime: 0.001,
            lastEvaluation: rfc3339(now() - 15000),
          },
          {
            state: 'inactive' as const,
            name: 'HighCPU',
            query: 'rate(node_cpu_seconds_total{mode="user"}[5m]) > 0.8',
            duration: 600,
            labels: { severity: 'warning' },
            annotations: { summary: 'High CPU usage on {{ $labels.instance }}' },
            alerts: [],
            health: 'ok',
            type: 'alerting' as const,
            evaluationTime: 0.003,
            lastEvaluation: rfc3339(now() - 15000),
          },
        ],
        interval: 15,
      },
      {
        name: 'recording_rules',
        file: '/etc/prometheus/rules/recording.yml',
        rules: [
          {
            name: 'job:http_requests_total:rate5m',
            query: 'sum(rate(http_requests_total[5m])) by (job)',
            labels: {},
            health: 'ok',
            type: 'recording' as const,
            evaluationTime: 0.002,
            lastEvaluation: rfc3339(now() - 15000),
          },
        ],
        interval: 15,
      },
    ],
  },
};

export const PROM_TSDB_STATUS = {
  status: 'success',
  data: {
    headStats: {
      numSeries: 24713,
      numLabelPairs: 1847,
      chunkCount: 98452,
      minTime: now() - 7200000,
      maxTime: now(),
    },
    seriesCountByMetricName: [
      { name: 'node_cpu_seconds_total', value: 128 },
      { name: 'http_requests_total', value: 96 },
      { name: 'http_request_duration_seconds_bucket', value: 480 },
      { name: 'go_goroutines', value: 12 },
      { name: 'process_cpu_seconds_total', value: 8 },
    ],
    labelValueCountByLabelName: [
      { name: '__name__', value: 312 },
      { name: 'instance', value: 18 },
      { name: 'job', value: 6 },
      { name: 'le', value: 14 },
      { name: 'code', value: 8 },
    ],
    memoryInBytesByLabelName: [
      { name: '__name__', value: 48271 },
      { name: 'instance', value: 12483 },
      { name: 'le', value: 8721 },
      { name: 'job', value: 3847 },
    ],
    seriesCountByLabelValuePair: [
      { name: 'job=prometheus', value: 342 },
      { name: 'job=node', value: 1847 },
      { name: 'instance=localhost:9090', value: 342 },
      { name: 'instance=web-01:9100', value: 612 },
    ],
  },
};

export const PROM_BUILD_INFO = {
  status: 'success',
  data: {
    version: '2.48.1',
    revision: 'e5c3281',
    branch: 'HEAD',
    buildUser: 'root@playground',
    buildDate: '20240101-00:00:00',
    goVersion: 'go1.21.6',
  },
};

export const PROM_RUNTIME_INFO = {
  status: 'success',
  data: {
    startTime: rfc3339(now() - 86400000 * 3),
    CWD: '/prometheus',
    reloadConfigSuccess: true,
    lastConfigTime: rfc3339(now() - 3600000),
    corruptionCount: 0,
    goroutineCount: 42,
    GOMAXPROCS: 4,
    GOGC: '',
    GODEBUG: '',
    storageRetention: '15d',
  },
};

export const PROM_CONFIG = {
  status: 'success',
  data: {
    yaml: `global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - /etc/prometheus/rules/*.yml

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'node'
    static_configs:
      - targets: ['web-01:9100', 'web-02:9100', 'db-01:9100']
`,
  },
};

export const PROM_METADATA: Record<string, Array<{ type: string; help: string; unit: string }>> = {
  up: [{ type: 'gauge', help: 'Target is up (1) or down (0).', unit: '' }],
  http_requests_total: [{ type: 'counter', help: 'Total HTTP requests processed.', unit: '' }],
  process_cpu_seconds_total: [{ type: 'counter', help: 'Total user and system CPU time spent in seconds.', unit: '' }],
  go_goroutines: [{ type: 'gauge', help: 'Number of goroutines that currently exist.', unit: '' }],
  node_cpu_seconds_total: [{ type: 'counter', help: 'Seconds the cpus spent in each mode.', unit: '' }],
  process_resident_memory_bytes: [{ type: 'gauge', help: 'Resident memory size in bytes.', unit: '' }],
  scrape_duration_seconds: [{ type: 'gauge', help: 'Duration of the scrape.', unit: '' }],
};

// ── VictoriaMetrics-specific mock data ──────────────────────────────────────

export const VM_BUILD_INFO = {
  status: 'success',
  data: {
    version: 'victoria-metrics-20240101-v1.96.0',
    revision: 'abc1234def',
    branch: 'main',
    buildUser: '',
    buildDate: '20240101-00:00:00',
    goVersion: 'go1.21.6',
  },
};

export const VM_ACTIVE_QUERIES = {
  status: 'success',
  data: [
    { duration: '0.234s', id: '1', remote_addr: '10.0.0.5:42817', query: 'rate(http_requests_total[5m])', start: Math.floor(now() / 1000) - 3600, end: Math.floor(now() / 1000), step: 15 },
    { duration: '1.102s', id: '2', remote_addr: '10.0.0.12:51923', query: 'sum by (job) (up)', start: Math.floor(now() / 1000) - 900, end: Math.floor(now() / 1000), step: 15 },
  ],
};

export const VM_TOP_QUERIES = {
  status: 'success',
  data: {
    topByCount: [
      { query: 'up', count: 4821, timeRangeSeconds: 3600, avgDurationSeconds: 0.002 },
      { query: 'rate(http_requests_total[5m])', count: 2104, timeRangeSeconds: 3600, avgDurationSeconds: 0.015 },
      { query: 'node_cpu_seconds_total', count: 1247, timeRangeSeconds: 3600, avgDurationSeconds: 0.008 },
    ],
    topByAvgDuration: [
      { query: 'histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))', count: 312, timeRangeSeconds: 3600, avgDurationSeconds: 0.847 },
      { query: 'rate(node_network_receive_bytes_total[5m])', count: 847, timeRangeSeconds: 3600, avgDurationSeconds: 0.092 },
    ],
    topBySumDuration: [
      { query: 'rate(http_requests_total[5m])', count: 2104, timeRangeSeconds: 3600, avgDurationSeconds: 0.015 },
      { query: 'up', count: 4821, timeRangeSeconds: 3600, avgDurationSeconds: 0.002 },
    ],
  },
};

export const VM_TSDB_STATUS = {
  status: 'success',
  data: {
    totalSeries: 31247,
    totalSeriesByAll: 31247,
    seriesCountByMetricName: [
      { name: 'node_cpu_seconds_total', value: 128 },
      { name: 'http_request_duration_seconds_bucket', value: 480 },
      { name: 'http_requests_total', value: 96 },
      { name: 'go_memstats_alloc_bytes', value: 24 },
    ],
    seriesCountByLabelName: [
      { name: '__name__', value: 31247 },
      { name: 'instance', value: 31247 },
      { name: 'job', value: 31247 },
      { name: 'le', value: 4800 },
    ],
    seriesCountByFocusLabelValue: [],
    seriesCountByLabelValuePair: [
      { name: 'job=node', value: 18471 },
      { name: 'job=prometheus', value: 8421 },
      { name: 'instance=web-01:9100', value: 6124 },
    ],
    labelValueCountByLabelName: [
      { name: '__name__', value: 312 },
      { name: 'instance', value: 18 },
      { name: 'job', value: 6 },
    ],
  },
};

export const VM_SNAPSHOTS = ['20240115-120000-abc1234', '20240114-060000-def5678'];

// ── Pre-set example queries ────────────────────────────────────────────────

export interface ExampleQuery {
  label: string;
  query: string;
  description: string;
  db?: string;
}

export const INFLUX_EXAMPLE_QUERIES: ExampleQuery[] = [
  { label: 'CPU Usage (last 1h)', query: 'SELECT mean("usage_user") FROM "cpu" WHERE time > now() - 1h GROUP BY time(10s), "host" fill(none)', db: 'telegraf', description: 'Average CPU usage per host over the last hour' },
  { label: 'Memory Usage', query: 'SELECT mean("used_percent") FROM "mem" WHERE time > now() - 1h GROUP BY time(10s) fill(none)', db: 'telegraf', description: 'Memory utilization percentage over the last hour' },
  { label: 'HTTP Requests', query: 'SELECT sum("count") FROM "http_requests" WHERE time > now() - 1h GROUP BY time(1m), "method" fill(0)', db: 'app_metrics', description: 'HTTP request count by method' },
  { label: 'Temperature Sensors', query: 'SELECT mean("value") FROM "temperature" WHERE time > now() - 1h GROUP BY time(30s), "sensor_id" fill(none)', db: 'iot_sensors', description: 'Temperature readings from IoT sensors' },
  { label: 'Show Databases', query: 'SHOW DATABASES', description: 'List all databases on the server' },
  { label: 'Show Measurements', query: 'SHOW MEASUREMENTS', db: 'telegraf', description: 'List all measurements in telegraf database' },
];

export const PROM_EXAMPLE_QUERIES: ExampleQuery[] = [
  { label: 'Target Status', query: 'up', description: 'Check which targets are up or down' },
  { label: 'HTTP Request Rate', query: 'rate(http_requests_total[5m])', description: 'Per-second rate of HTTP requests over 5 minutes' },
  { label: 'CPU Usage', query: 'rate(process_cpu_seconds_total[5m])', description: 'CPU usage rate by process' },
  { label: 'Memory Usage', query: 'process_resident_memory_bytes', description: 'Resident memory usage per process' },
  { label: 'Goroutines', query: 'go_goroutines', description: 'Number of goroutines per instance' },
  { label: 'Scrape Duration', query: 'scrape_duration_seconds', description: 'Duration of each Prometheus scrape' },
];

export const VM_EXAMPLE_QUERIES: ExampleQuery[] = [
  { label: 'Target Status', query: 'up', description: 'Check which targets are up or down' },
  { label: 'HTTP Request Rate', query: 'rate(http_requests_total[5m])', description: 'Per-second rate of HTTP requests over 5 minutes' },
  { label: 'CPU Usage', query: 'rate(process_cpu_seconds_total[5m])', description: 'CPU usage rate by process' },
  { label: 'Memory Usage', query: 'process_resident_memory_bytes', description: 'Resident memory usage per process' },
  { label: 'Active Series', query: 'vm_cache_entries{type="storage/metricName"}', description: 'VictoriaMetrics active series count' },
  { label: 'Ingestion Rate', query: 'rate(vm_rows_inserted_total[5m])', description: 'Data ingestion rate' },
];
