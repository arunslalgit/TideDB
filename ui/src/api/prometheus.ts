// Prometheus API Client
// Communicates with Prometheus via the Go proxy at /proxy/prometheus/

export interface PrometheusResponse<T = any> {
  status: 'success' | 'error';
  data: T;
  errorType?: string;
  error?: string;
  warnings?: string[];
}

export interface InstantVector {
  metric: Record<string, string>;
  value: [number, string];
}

export interface RangeMatrix {
  metric: Record<string, string>;
  values: [number, string][];
}

export interface Target {
  discoveredLabels: Record<string, string>;
  labels: Record<string, string>;
  scrapePool: string;
  scrapeUrl: string;
  globalUrl: string;
  lastError: string;
  lastScrape: string;
  lastScrapeDuration: number;
  health: 'up' | 'down' | 'unknown';
  scrapeInterval: string;
  scrapeTimeout: string;
}

export interface TargetsData {
  activeTargets: Target[];
  droppedTargets: Array<{ discoveredLabels: Record<string, string> }>;
}

export interface RuleGroup {
  name: string;
  file: string;
  rules: Rule[];
  interval: number;
}

export interface Rule {
  state?: 'firing' | 'pending' | 'inactive';
  name: string;
  query: string;
  duration?: number;
  labels: Record<string, string>;
  annotations?: Record<string, string>;
  alerts?: Alert[];
  health: string;
  type: 'alerting' | 'recording';
  evaluationTime?: number;
  lastEvaluation?: string;
}

export interface Alert {
  labels: Record<string, string>;
  annotations: Record<string, string>;
  state: string;
  activeAt: string;
  value: string;
}

export interface TSDBStatus {
  headStats: {
    numSeries: number;
    numLabelPairs: number;
    chunkCount: number;
    minTime: number;
    maxTime: number;
  };
  seriesCountByMetricName: Array<{ name: string; value: number }>;
  labelValueCountByLabelName: Array<{ name: string; value: number }>;
  memoryInBytesByLabelName: Array<{ name: string; value: number }>;
  seriesCountByLabelValuePair: Array<{ name: string; value: number }>;
}

export interface BuildInfo {
  version: string;
  revision: string;
  branch: string;
  buildUser: string;
  buildDate: string;
  goVersion: string;
}

export interface RuntimeInfo {
  startTime: string;
  CWD: string;
  reloadConfigSuccess: boolean;
  lastConfigTime: string;
  corruptionCount: number;
  goroutineCount: number;
  GOMAXPROCS: number;
  GOGC: string;
  GODEBUG: string;
  storageRetention: string;
}

export interface MetricMetadata {
  type: string;
  help: string;
  unit: string;
}

export interface AlertmanagerAlert {
  annotations: Record<string, string>;
  endsAt: string;
  fingerprint: string;
  receivers: Array<{ name: string }>;
  startsAt: string;
  status: { inhibitedBy: string[]; silencedBy: string[]; state: string };
  updatedAt: string;
  generatorURL: string;
  labels: Record<string, string>;
}

export interface AlertmanagerSilence {
  id: string;
  status: { state: string };
  updatedAt: string;
  comment: string;
  createdBy: string;
  endsAt: string;
  startsAt: string;
  matchers: Array<{ name: string; value: string; isRegex: boolean; isEqual: boolean }>;
}

class PrometheusClient {
  private proxyBase = '/proxy/prometheus/';
  private amProxyBase = '/proxy/alertmanager/';

  private buildURL(
    targetUrl: string,
    apiPath: string,
    params?: Record<string, string>,
    base?: string,
  ): string {
    const searchParams = new URLSearchParams();
    searchParams.set('target', targetUrl);
    searchParams.set('path', apiPath);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== '') searchParams.set(k, v);
      }
    }
    return (base || this.proxyBase) + '?' + searchParams.toString();
  }

  private async doFetch<T>(
    url: string,
    options?: RequestInit,
    headers?: Record<string, string>,
  ): Promise<T> {
    const res = await fetch(url, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...headers,
        ...((options?.headers as Record<string, string>) || {}),
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Request failed (${res.status}): ${text}`);
    }
    return res.json();
  }

  // ── Query APIs ──────────────────────────────────────────────────────

  async instantQuery(
    target: string,
    query: string,
    time?: string,
    auth?: { username?: string; password?: string },
  ): Promise<PrometheusResponse<{ resultType: string; result: InstantVector[] }>> {
    const params: Record<string, string> = { query };
    if (time) params.time = time;
    const url = this.buildURL(target, '/api/v1/query', params);
    return this.doFetch(url, undefined, this.authHeaders(auth));
  }

  async rangeQuery(
    target: string,
    query: string,
    start: string,
    end: string,
    step: string,
    auth?: { username?: string; password?: string },
  ): Promise<PrometheusResponse<{ resultType: string; result: RangeMatrix[] }>> {
    const params: Record<string, string> = { query, start, end, step };
    const url = this.buildURL(target, '/api/v1/query_range', params);
    return this.doFetch(url, undefined, this.authHeaders(auth));
  }

  // ── Metadata APIs ──────────────────────────────────────────────────

  async getLabels(
    target: string,
    auth?: { username?: string; password?: string },
  ): Promise<PrometheusResponse<string[]>> {
    const url = this.buildURL(target, '/api/v1/labels');
    return this.doFetch(url, undefined, this.authHeaders(auth));
  }

  async getLabelValues(
    target: string,
    label: string,
    auth?: { username?: string; password?: string },
  ): Promise<PrometheusResponse<string[]>> {
    const url = this.buildURL(target, `/api/v1/label/${encodeURIComponent(label)}/values`);
    return this.doFetch(url, undefined, this.authHeaders(auth));
  }

  async getMetadata(
    target: string,
    auth?: { username?: string; password?: string },
    metric?: string,
    limit?: number,
  ): Promise<PrometheusResponse<Record<string, MetricMetadata[]>>> {
    const params: Record<string, string> = {};
    if (metric) params.metric = metric;
    if (limit) params.limit = String(limit);
    const url = this.buildURL(target, '/api/v1/metadata', params);
    return this.doFetch(url, undefined, this.authHeaders(auth));
  }

  async getSeries(
    target: string,
    match: string[],
    auth?: { username?: string; password?: string },
  ): Promise<PrometheusResponse<Array<Record<string, string>>>> {
    const searchParams = new URLSearchParams();
    searchParams.set('target', target);
    searchParams.set('path', '/api/v1/series');
    for (const m of match) {
      searchParams.append('match[]', m);
    }
    const url = this.proxyBase + '?' + searchParams.toString();
    return this.doFetch(url, undefined, this.authHeaders(auth));
  }

  // ── Target APIs ────────────────────────────────────────────────────

  async getTargets(
    target: string,
    state?: string,
    auth?: { username?: string; password?: string },
  ): Promise<PrometheusResponse<TargetsData>> {
    const params: Record<string, string> = {};
    if (state) params.state = state;
    const url = this.buildURL(target, '/api/v1/targets', params);
    return this.doFetch(url, undefined, this.authHeaders(auth));
  }

  // ── Rules APIs ─────────────────────────────────────────────────────

  async getRules(
    target: string,
    type?: string,
    auth?: { username?: string; password?: string },
  ): Promise<PrometheusResponse<{ groups: RuleGroup[] }>> {
    const params: Record<string, string> = {};
    if (type) params.type = type;
    const url = this.buildURL(target, '/api/v1/rules', params);
    return this.doFetch(url, undefined, this.authHeaders(auth));
  }

  async getAlerts(
    target: string,
    auth?: { username?: string; password?: string },
  ): Promise<PrometheusResponse<{ alerts: Alert[] }>> {
    const url = this.buildURL(target, '/api/v1/alerts');
    return this.doFetch(url, undefined, this.authHeaders(auth));
  }

  // ── Status APIs ────────────────────────────────────────────────────

  async getBuildInfo(
    target: string,
    auth?: { username?: string; password?: string },
  ): Promise<PrometheusResponse<BuildInfo>> {
    const url = this.buildURL(target, '/api/v1/status/buildinfo');
    return this.doFetch(url, undefined, this.authHeaders(auth));
  }

  async getRuntimeInfo(
    target: string,
    auth?: { username?: string; password?: string },
  ): Promise<PrometheusResponse<RuntimeInfo>> {
    const url = this.buildURL(target, '/api/v1/status/runtimeinfo');
    return this.doFetch(url, undefined, this.authHeaders(auth));
  }

  async getTSDBStatus(
    target: string,
    auth?: { username?: string; password?: string },
  ): Promise<PrometheusResponse<TSDBStatus>> {
    const url = this.buildURL(target, '/api/v1/status/tsdb');
    return this.doFetch(url, undefined, this.authHeaders(auth));
  }

  async getFlags(
    target: string,
    auth?: { username?: string; password?: string },
  ): Promise<PrometheusResponse<Record<string, string>>> {
    const url = this.buildURL(target, '/api/v1/status/flags');
    return this.doFetch(url, undefined, this.authHeaders(auth));
  }

  async getConfig(
    target: string,
    auth?: { username?: string; password?: string },
  ): Promise<PrometheusResponse<{ yaml: string }>> {
    const url = this.buildURL(target, '/api/v1/status/config');
    return this.doFetch(url, undefined, this.authHeaders(auth));
  }

  // ── Alertmanager APIs ──────────────────────────────────────────────

  async getAMAlerts(
    target: string,
    auth?: { username?: string; password?: string },
  ): Promise<AlertmanagerAlert[]> {
    const url = this.buildURL(target, '/api/v2/alerts', undefined, this.amProxyBase);
    return this.doFetch(url, undefined, this.authHeaders(auth));
  }

  async getAMSilences(
    target: string,
    auth?: { username?: string; password?: string },
  ): Promise<AlertmanagerSilence[]> {
    const url = this.buildURL(target, '/api/v2/silences', undefined, this.amProxyBase);
    return this.doFetch(url, undefined, this.authHeaders(auth));
  }

  async createAMSilence(
    target: string,
    silence: {
      matchers: Array<{ name: string; value: string; isRegex: boolean; isEqual: boolean }>;
      startsAt: string;
      endsAt: string;
      createdBy: string;
      comment: string;
    },
    auth?: { username?: string; password?: string },
  ): Promise<{ silenceID: string }> {
    const url = this.buildURL(target, '/api/v2/silences', undefined, this.amProxyBase);
    return this.doFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(silence),
    }, this.authHeaders(auth));
  }

  async deleteAMSilence(
    target: string,
    silenceId: string,
    auth?: { username?: string; password?: string },
  ): Promise<void> {
    const url = this.buildURL(target, `/api/v2/silence/${silenceId}`, undefined, this.amProxyBase);
    await fetch(url, {
      method: 'DELETE',
      headers: this.authHeaders(auth),
    });
  }

  async getAMStatus(
    target: string,
    auth?: { username?: string; password?: string },
  ): Promise<any> {
    const url = this.buildURL(target, '/api/v2/status', undefined, this.amProxyBase);
    return this.doFetch(url, undefined, this.authHeaders(auth));
  }

  // Test connection by hitting buildinfo
  async testConnection(
    target: string,
    auth?: { username?: string; password?: string },
  ): Promise<boolean> {
    try {
      const resp = await this.getBuildInfo(target, auth);
      return resp.status === 'success';
    } catch {
      return false;
    }
  }

  async testAlertmanager(
    target: string,
    auth?: { username?: string; password?: string },
  ): Promise<boolean> {
    try {
      await this.getAMStatus(target, auth);
      return true;
    } catch {
      return false;
    }
  }

  private authHeaders(auth?: { username?: string; password?: string }): Record<string, string> {
    const h: Record<string, string> = {};
    if (auth?.username) h['X-Proxy-Username'] = auth.username;
    if (auth?.password) h['X-Proxy-Password'] = auth.password;
    return h;
  }
}

export const prometheusClient = new PrometheusClient();
export default prometheusClient;
