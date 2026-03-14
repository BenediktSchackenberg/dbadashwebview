import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { api } from '../api/api';
import { RefreshCw, Clock, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

/* ─── Correct column names from dbo.Summary_Get ─── */

const STATUS_KEYS: { key: string; label: string }[] = [
  { key: 'FullBackupStatus', label: 'Backup FULL' },
  { key: 'DiffBackupStatus', label: 'Backup DIFF' },
  { key: 'LogBackupStatus', label: 'Backup LOG' },
  { key: 'DriveStatus', label: 'Drive Space' },
  { key: 'FileFreeSpaceStatus', label: 'File Space' },
  { key: 'LogFreeSpaceStatus', label: 'Log Space' },
  { key: 'JobStatus', label: 'Agent Jobs' },
  { key: 'AGStatus', label: 'Availability Groups' },
  { key: 'CorruptionStatus', label: 'Corruption' },
  { key: 'LastGoodCheckDBStatus', label: 'Last Good Check DB' },
  { key: 'MemoryDumpStatus', label: 'Memory Dump' },
  { key: 'SnapshotAgeStatus', label: 'Snapshot Age' },
  { key: 'UptimeStatus', label: 'Instance Uptime' },
  { key: 'IsAgentRunningStatus', label: 'Is Agent Running' },
  { key: 'DBMailStatus', label: 'DB Mail' },
  { key: 'QueryStoreStatus', label: 'QS' },
  { key: 'AlertStatus', label: 'SQL Agent Alerts' },
  { key: 'PctMaxSizeStatus', label: '% Max Size' },
  { key: 'CollectionErrorStatus', label: 'DBA Dash Errors (24hrs)' },
  { key: 'DatabaseStateStatus', label: 'Database State' },
  { key: 'IdentityStatus', label: 'Identity Columns' },
  { key: 'LogShippingStatus', label: 'Log Shipping' },
];


function cellBg(count: number, type: 'ok' | 'warning' | 'critical' | 'na'): string {
  if (count === 0) return 'text-gray-600';
  if (type === 'ok') return 'bg-green-600/60 text-green-100 font-semibold';
  if (type === 'warning') return 'bg-yellow-500/60 text-yellow-100 font-semibold';
  if (type === 'critical') return 'bg-red-600/60 text-red-100 font-semibold';
  return 'text-gray-400';
}

export default function SummaryPage() {
  const [summary, setSummary] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(30);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const data = await api.dashboardSummary();
      setSummary(Array.isArray(data) ? data : []);
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

  // Build status matrix
  const matrix = useMemo(() => {
    return STATUS_KEYS.map(sk => {
      let ok = 0, warning = 0, critical = 0, na = 0;
      for (const row of summary) {
        const raw = row[sk.key];
        if (raw == null) { na++; continue; }
        const v = Number(raw);
        if (v === 1) ok++;
        else if (v === 2) warning++;
        else if (v === 4) critical++;
        else if (v === 3) na++;
        else na++;
      }
      // Hide rows where all instances are N/A (not relevant)
      if (ok + warning + critical === 0 && na === summary.length) return null;
      return { ...sk, ok, warning, critical, na, total: ok + warning + critical + na };
    }).filter(Boolean) as { key: string; label: string; ok: number; warning: number; critical: number; na: number; total: number }[];
  }, [summary]);

  if (loading && summary.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
        <p className="text-gray-400">Loading Summary...</p>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Summary</h1>
          <p className="text-xs text-gray-500">{summary.length} instances · DBA Dash Summary_Get</p>
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-400">
          <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {lastRefresh.toLocaleTimeString()}</span>
          <span className="flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5" /> {countdown}s</span>
          <button onClick={fetchData} className="p-1.5 rounded hover:bg-white/10">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Status Matrix */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-800/80">
                <th className="px-3 py-2.5 text-left text-gray-400 font-semibold uppercase tracking-wider">Test</th>
                <th className="px-3 py-2.5 text-center text-green-400 font-semibold">Instance Count OK</th>
                <th className="px-3 py-2.5 text-center text-yellow-400 font-semibold">Instance Count Warning</th>
                <th className="px-3 py-2.5 text-center text-red-400 font-semibold">Instance Count Critical</th>
                <th className="px-3 py-2.5 text-center text-gray-400 font-semibold">Instance Count N/A</th>
                <th className="px-3 py-2.5 text-center text-gray-400 font-semibold">Instance Count Acknowledged</th>
              </tr>
            </thead>
            <tbody>
              {matrix.map((m) => (
                <tr key={m.key} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className={`px-3 py-1.5 font-medium ${m.critical > 0 ? 'text-red-400' : m.warning > 0 ? 'text-yellow-400' : 'text-white'}`}>
                    {m.label}
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <span className={`inline-block min-w-[2rem] px-2 py-0.5 rounded ${cellBg(m.ok, 'ok')}`}>{m.ok}</span>
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <span className={`inline-block min-w-[2rem] px-2 py-0.5 rounded ${cellBg(m.warning, 'warning')}`}>{m.warning}</span>
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <span className={`inline-block min-w-[2rem] px-2 py-0.5 rounded ${cellBg(m.critical, 'critical')}`}>{m.critical}</span>
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <span className={`inline-block min-w-[2rem] px-2 py-0.5 rounded ${cellBg(m.na, 'na')}`}>{m.na}</span>
                  </td>
                  <td className="px-3 py-1.5 text-center text-gray-600">0</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
