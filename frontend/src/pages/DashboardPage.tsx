import { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/api';
import { RefreshCw, ArrowUpDown, ArrowUp, ArrowDown, Clock, Loader2 } from 'lucide-react';

type SortDir = 'asc' | 'desc';
type Thresholds = Record<string, { warning: number; critical: number }>;

const columns = [
  { key: 'instanceDisplayName', label: 'Instance', align: 'left' as const },
  { key: 'avgCPU', label: 'Avg CPU%', align: 'right' as const },
  { key: 'maxCPU', label: 'Max CPU%', align: 'right' as const },
  { key: 'criticalWaitMs', label: 'Critical Wait (ms)', align: 'right' as const },
  { key: 'lockWaitMs', label: 'Lock Wait (ms)', align: 'right' as const },
  { key: 'ioWaitMs', label: 'IO Wait (ms)', align: 'right' as const },
  { key: 'totalWaitMs', label: 'Total Wait (ms)', align: 'right' as const },
  { key: 'signalWaitPct', label: 'Signal Wait %', align: 'right' as const },
  { key: 'latchWaitMs', label: 'Latch Wait (ms)', align: 'right' as const },
  { key: 'readLatency', label: 'Read Latency (ms)', align: 'right' as const },
  { key: 'writeLatency', label: 'Write Latency (ms)', align: 'right' as const },
  { key: 'mBsec', label: 'MB/sec', align: 'right' as const },
  { key: 'iOPs', label: 'IOPs', align: 'right' as const },
];

function getCellClass(key: string, value: number, thresholds: Thresholds): string {
  const t = thresholds[key];
  if (!t) return '';
  if (value >= t.critical) return 'bg-red-900/50 text-red-300';
  if (value >= t.warning) return 'bg-amber-900/50 text-amber-300';
  return 'bg-green-900/50 text-green-300';
}

function formatNum(v: any): string {
  if (v == null) return '0';
  const n = Number(v);
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

export default function DashboardPage() {
  const [data, setData] = useState<any[]>([]);
  const [thresholds, setThresholds] = useState<Thresholds>({});
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<string>('instanceDisplayName');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [countdown, setCountdown] = useState(30);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [perfRes, thRes] = await Promise.all([
        api.dashboardPerformanceSummary().catch(() => ({ data: [], note: '' })),
        api.getThresholds().catch(() => ({ thresholds: {} })),
      ]);
      setData(perfRes.data || []);
      setThresholds(thRes.thresholds || {});
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
      setCountdown(30);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { fetchData(); return 30; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchData]);

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'instanceDisplayName' ? 'asc' : 'desc'); }
  };

  const sorted = [...data].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    if (sortKey === 'instanceDisplayName') {
      const cmp = String(av || '').localeCompare(String(bv || ''));
      return sortDir === 'asc' ? cmp : -cmp;
    }
    const cmp = (Number(av) || 0) - (Number(bv) || 0);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const SortIcon = ({ col }: { col: string }) => {
    if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Performance Summary</h1>
        <div className="flex items-center gap-4 text-sm text-gray-400">
          <span>{data.length} instances</span>
          {loading && data.length > 0 && <span className="flex items-center gap-1 text-blue-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Updating...</span>}
          <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {lastRefresh.toLocaleTimeString()}</span>
          <span className="flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5" /> Refreshing in {countdown}s</span>
          <button onClick={() => { fetchData(); }} className="p-1.5 rounded hover:bg-white/10 transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading && data.length === 0 && (
        <div className="glass rounded-xl p-12 flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
          <p className="text-gray-300 text-lg">Loading performance data from {data.length || '~200'} instances...</p>
          <p className="text-gray-500 text-sm">This may take a few seconds on first load</p>
        </div>
      )}

      <div className={`glass rounded-xl overflow-hidden ${loading && data.length === 0 ? 'hidden' : ''}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-[Inter]">
            <thead>
              <tr className="bg-slate-800/80 sticky top-0 z-10">
                {columns.map(col => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={`py-2 px-3 text-xs font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap transition-colors hover:text-white ${col.align === 'right' ? 'text-right' : 'text-left'} text-gray-400`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      <SortIcon col={col.key} />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {sorted.map((row, i) => (
                <tr key={row.instanceID || i} className="hover:bg-white/5 transition-colors">
                  {columns.map(col => {
                    if (col.key === 'instanceDisplayName') {
                      return (
                        <td key={col.key} className="py-2 px-3 text-left whitespace-nowrap">
                          <Link to={`/instances/${row.instanceID}`} className="text-blue-400 hover:text-blue-300 hover:underline">
                            {row.instanceDisplayName || 'Unknown'}
                          </Link>
                        </td>
                      );
                    }
                    const val = Number(row[col.key]) || 0;
                    const cellClass = getCellClass(col.key, val, thresholds);
                    return (
                      <td key={col.key} className={`py-2 px-3 text-right font-mono whitespace-nowrap ${cellClass}`}>
                        {formatNum(val)}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {data.length === 0 && !loading && (
                <tr><td colSpan={columns.length} className="py-8 text-center text-gray-500">No performance data available</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
