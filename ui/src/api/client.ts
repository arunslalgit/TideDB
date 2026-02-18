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

export interface RemoteConnection {
  url: string;
  username: string;
  password: string;
}

class TideDBClient {
  private baseUrl: string;
  private credentials: { username?: string; password?: string } = {};
  private _standaloneMode = false;
  private _remoteConnection: RemoteConnection | null = null;

  constructor() {
    this.baseUrl = '';
  }

  get standaloneMode() {
    return this._standaloneMode;
  }

  setStandaloneMode(enabled: boolean) {
    this._standaloneMode = enabled;
  }

  setRemoteConnection(conn: RemoteConnection | null) {
    this._remoteConnection = conn;
  }

  getRemoteConnection(): RemoteConnection | null {
    return this._remoteConnection;
  }

  setCredentials(username: string, password: string) {
    this.credentials = { username, password };
  }

  private getAuthParams(): string {
    // In standalone mode with a remote connection, auth is handled via proxy headers.
    if (this._standaloneMode && this._remoteConnection) return '';
    const params = new URLSearchParams();
    if (this.credentials.username) {
      params.set('u', this.credentials.username);
    }
    if (this.credentials.password) {
      params.set('p', this.credentials.password);
    }
    return params.toString();
  }

  // Headers that tell the standalone proxy which InfluxDB instance to target.
  private getProxyHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this._standaloneMode && this._remoteConnection) {
      headers['X-Influxdb-Url'] = this._remoteConnection.url;
      if (this._remoteConnection.username) {
        headers['X-Influxdb-Username'] = this._remoteConnection.username;
      }
      if (this._remoteConnection.password) {
        headers['X-Influxdb-Password'] = this._remoteConnection.password;
      }
    }
    return headers;
  }

  async ping(): Promise<{ version: string; ok: boolean }> {
    try {
      const res = await fetch(`${this.baseUrl}/ping`, {
        headers: this.getProxyHeaders(),
      });
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
      headers: { 'Accept': 'application/json', ...this.getProxyHeaders() },
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
      headers: this.getProxyHeaders(),
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
    const res = await fetch(`${this.baseUrl}/debug/vars`, {
      headers: this.getProxyHeaders(),
    });
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
    if (!series || !Array.isArray(series.values)) return [];
    return series.values.map((v: any[]) => ({
      user: v[0],
      admin: v[1],
    }));
  }

  async getUserGrants(username: string): Promise<any[]> {
    const result = await this.query(`SHOW GRANTS FOR "${username}"`);
    const series = result.results?.[0]?.series?.[0];
    if (!series) return [];
    return series.values.map((v: any[]) => {
      const grant: Record<string, any> = {};
      series.columns.forEach((col: string, i: number) => {
        grant[col] = v[i];
      });
      return grant;
    });
  }

  async getSubscriptions(): Promise<any[]> {
    const result = await this.query('SHOW SUBSCRIPTIONS');
    return result.results?.[0]?.series || [];
  }

  async getTagValues(db: string, measurement: string, tagKey: string): Promise<string[]> {
    const result = await this.query(`SHOW TAG VALUES FROM "${measurement}" WITH KEY = "${tagKey}"`, db);
    const series = result.results?.[0]?.series?.[0];
    if (!series) return [];
    const valueIdx = series.columns.indexOf('value');
    return series.values.map((v: any[]) => v[valueIdx >= 0 ? valueIdx : 1] as string);
  }

  async backup(): Promise<Blob> {
    const res = await fetch(`${this.baseUrl}/debug/backup`, {
      method: 'GET',
      headers: this.getProxyHeaders(),
    });
    if (!res.ok) {
      throw new Error(`Backup failed (${res.status}): ${await res.text()}`);
    }
    return res.blob();
  }
}

export const client = new TideDBClient();
export default client;
