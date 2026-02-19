import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Copy, Check, Search } from 'lucide-react';
import { useActiveConnection } from '../../hooks/useActiveConnection';
import prometheusClient from '../../api/prometheus';

export default function PromConfig() {
  const { connection, auth } = useActiveConnection();
  const [config, setConfig] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [search, setSearch] = useState('');

  const fetchConfig = useCallback(async () => {
    if (!connection || (connection.type !== 'prometheus' && connection.type !== 'victoriametrics')) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await prometheusClient.getConfig(connection.url, auth);
      if (resp.status !== 'success') throw new Error('Failed to fetch config');
      setConfig(resp.data.yaml || '');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [connection, auth]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(config);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Simple search highlight
  const lines = config.split('\n');
  const matchingLines = search
    ? lines.map((line, i) => ({ line, num: i + 1, match: line.toLowerCase().includes(search.toLowerCase()) }))
    : lines.map((line, i) => ({ line, num: i + 1, match: false }));

  if (!connection || (connection.type !== 'prometheus' && connection.type !== 'victoriametrics')) {
    return <div className="flex items-center justify-center h-full text-gray-500"><p>Select a Prometheus connection.</p></div>;
  }

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-white">
          {connection.type === 'victoriametrics' ? 'Runtime Flags' : 'Running Config'}
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            disabled={!config}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs transition-colors"
          >
            {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button onClick={fetchConfig} disabled={loading} className="p-2 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && <div className="p-3 rounded bg-red-900/30 border border-red-800 text-red-300 text-sm">{error}</div>}

      {/* Search */}
      <div className="relative max-w-xs">
        <Search size={14} className="absolute left-2.5 top-2 text-gray-500" />
        <input
          type="text"
          placeholder="Search in config..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-200 text-xs placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Config display */}
      {config && (
        <div className="rounded-lg border border-gray-800 overflow-auto max-h-[calc(100vh-250px)]">
          <pre className="p-4 text-xs font-mono leading-relaxed">
            {matchingLines.map((l) => (
              <div
                key={l.num}
                className={`flex ${l.match ? 'bg-yellow-900/20' : ''}`}
              >
                <span className="text-gray-600 select-none w-10 text-right pr-3 flex-shrink-0">{l.num}</span>
                <span className="text-gray-300 whitespace-pre">{l.line}</span>
              </div>
            ))}
          </pre>
        </div>
      )}

      {!config && !loading && !error && (
        <div className="text-center py-12 text-gray-500 text-sm">No config loaded</div>
      )}
    </div>
  );
}
