import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/api';
import { RefreshCw, Clock, Loader2, ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';

/* ─── Status helpers ─── */

const STATUS_KEYS = [
  { key: 'MemoryDumpStatus', label: 'Memory Dump' },
  { key: 'CorruptionStatus', label: 'Corruption' },
  { key: 'LastGoodCheckDBStatus', label: 'Last Good Check DB' },
  { key: 'AgentJobsStatus', label: 'Agent Jobs' },
  { key: 'FullBackupStatus', label: 'Backup FULL' },
  { key: 'DiffBackupStatus', label: 'Backup DIFF' },
  { key: 'LogBackupStatus', label: 'Backup LOG' },
  { key: 'DriveStatus', label: 'Drive Space' },
  { key: 'FileSpaceStatus', label: 'File Space' },
  { key: 'AGStatus', label: 'Availability Groups' },
  { key: 'LogSpaceStatus', label: 'Log Space' },
  { key: 'IdentityColumnsStatus', label: 'Identity Columns' },
  { key: 'InstanceUptimeStatus', label: 'Instance Uptime' },
  { key: 'IsAgentRunningStatus', label: 'Is Agent Running' },
  { key: 'DBMailStatus', label: 'DB Mail' },
  { key: 'QSStatus', label: 'QS' },
  { key: 'SnapshotAgeStatus', label: 'Snapshot Age' },
  { key: 'SQLAgentAlertsStatus', label: 'SQL Agent Alerts' },
  { key: 'MaxSizeStatus', label: '% Max Size' },
  { key: 'DBADashErrorsStatus', label: 'DBA Dash Errors (24hrs)' },
  { key: 'DatabaseStateStatus', label: 'Database State' },
  { key: 'MemoryDumpStatus', label: 'Memory Dump' },
];

// De-duplicate by key
const UNIQUE_STATUS_KEYS = STATUS_KEYS.filter((v, i, a) => a.findIndex(t => t.key === v.key) === i);

// Detail table columns from original DBA Dash
const DETAIL_COLS = [
  { key: 'InstanceDisplayName', label: 'Instance', type: 'link' },
  { key: 'MemoryDumpStatus', label: 'Memory Dump', type: 'status' },
  { key: 'CorruptionStatus', label: 'Corruption', type: 'status' },
  { key: 'LastGoodCheckDBStatus', label: 'Last Good\nCheck DB', type: 'status' },
  { key: 'MaxSizeStatus', label: '% Max\nSize', type: 'status' },
  { key: 'AgentJobsStatus', label: 'Agent\nJobs', type: 'status' },
  { key: 'FullBackupStatus', label: 'Backup\nFULL', type: 'status' },
  { key: 'DiffBackupStatus', label: 'Backup\nDIFF', type: 'status' },
  { key: 'LogBackupStatus', label: 'Backup\nLOG', type: 'status' },
  { key: 'DriveStatus', label: 'Drive\nSpace', type: 'status' },
  { key: 'AGStatus', label: 'Availability\nGroups', type: 'status' },
  { key: 'LogSpaceStatus', label: 'Log\nSpace', type: 'status' },
  { key: 'FileSpaceStatus', label: 'File\nSpace', type: 'status' },
  { key: 'QSStatus', label: 'QS', type: 'status' },
  { key: 'DBADashErrorsStatus', label: 'DBA Dash\nErrors', type: 'status' },
  { key: 'SnapshotAgeStatus', label: 'Snapshot\nAge', type: 'status' },
  { key: 'DBMailStatus', label: 'DB\nMail', type: 'status' },
  { key: 'IdentityColumnsStatus', label: 'Identity\nColumns', type: 'status' },
  { key: 'DatabaseStateStatus', label: 'Database\nState', type: 'status' },
  { key: 'InstanceUptimeStatus', label: 'Instance\nUptime', type: 'status' },
];

function statusColor(val: number | null | undefined): string {
  if (val == null) return '';
  const v = Number(val);
  if (v === 1) return 'bg-green-600/80 text-white';  // OK
  if (v === 2) return 'bg-yellow-500/80 text-black';  // Warning
  if (v === 3) return 'bg-transparent text-gray-500';  // N/A
  if (v === 4) return 'bg-red-600/80 text-white';     // Critical
  return '';
}

function statusLabel(val: number | null | undefined): string {
  if (val == null) return '';
  const v = Number(val);
  if (v === 1) return 'View';
  if (v === 2) return 'View';
  if (v === 3) return '';
  if (v === 4) return 'View';
  return '';
}


export default function SummaryPage() {
  const [summary, setSummary] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(30);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('InstanceDisplayName');
  const [sortAsc, setSortAsc] = useState(true);
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

  // Build status matrix: for each status key, count OK/Warning/Critical/N/A
  const matrix = useMemo(() => {
    return UNIQUE_STATUS_KEYS.map(sk => {
      let ok = 0, warning = 0, critical = 0, na = 0, ack = 0;
      for (const row of summary) {
        const v = row[sk.key] != null ? Number(row[sk.key]) : null;
        if (v === 1) ok++;
        else if (v === 2) warning++;
        else if (v === 4) critical++;
        else if (v === 3) na++;
        else na++;
      }
      return { ...sk, ok, warning, critical, na, ack, total: ok + warning + critical + na };
    }).filter(r => r.total > 0); // hide unused categories
  }, [summary]);

  // Filtered and sorted detail rows
  const q = search.toLowerCase();
  const filtered = useMemo(() => {
    let rows = summary;
    if (q) rows = rows.filter(r => ((r.InstanceDisplayName || r.Instance || '') as string).toLowerCase().includes(q));
    return [...rows].sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      if (sortKey === 'InstanceDisplayName') {
        av = av || a.Instance || '';
        bv = bv || b.Instance || '';
        const cmp = String(av).localeCompare(String(bv));
        return sortAsc ? cmp : -cmp;
      }
      const na = Number(av) || 0, nb = Number(bv) || 0;
      return sortAsc ? na - nb : nb - na;
    });
  }, [summary, q, sortKey, sortAsc]);

  const handleSort = (key: string) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(key === 'InstanceDisplayName'); }
  };

  if (loading && summary.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
        <p className="text-gray-400">Loading Summary_Get...</p>
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

      {/* Status Matrix (top section from DBA Dash) */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-800/80">
                <th className="px-3 py-2 text-left text-gray-400 font-semibold uppercase tracking-wider">Test</th>
                <th className="px-3 py-2 text-center text-green-400 font-semibold">Instance Count OK</th>
                <th className="px-3 py-2 text-center text-yellow-400 font-semibold">Instance Count Warning</th>
                <th className="px-3 py-2 text-center text-red-400 font-semibold">Instance Count Critical</th>
                <th className="px-3 py-2 text-center text-gray-400 font-semibold">Instance Count N/A</th>
                <th className="px-3 py-2 text-center text-gray-400 font-semibold">Instance Count Acknowledged</th>
              </tr>
            </thead>
            <tbody>
              {matrix.map((m, i) => {
                const hasIssues = m.warning > 0 || m.critical > 0;
                return (
                  <tr key={m.key} className={clsx('border-b border-white/5 transition-colors', hasIssues ? 'hover:bg-white/5' : 'hover:bg-white/3')}>
                    <td className={clsx('px-3 py-1.5 font-medium', m.critical > 0 ? 'text-red-400' : m.warning > 0 ? 'text-yellow-400' : 'text-white')}>
                      {m.label}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <span className={clsx('inline-block min-w-[2rem] px-2 py-0.5 rounded', m.ok > 0 ? 'bg-green-600/60 text-green-100' : 'text-gray-600')}>{m.ok}</span>
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <span className={clsx('inline-block min-w-[2rem] px-2 py-0.5 rounded', m.warning > 0 ? 'bg-yellow-500/60 text-yellow-100' : 'text-gray-600')}>{m.warning}</span>
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <span className={clsx('inline-block min-w-[2rem] px-2 py-0.5 rounded', m.critical > 0 ? 'bg-red-600/60 text-red-100' : 'text-gray-600')}>{m.critical}</span>
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <span className={clsx('inline-block min-w-[2rem] px-2 py-0.5 rounded', m.na > 0 ? 'bg-gray-600/40 text-gray-300' : 'text-gray-600')}>{m.na}</span>
                    </td>
                    <td className="px-3 py-1.5 text-center text-gray-600">{m.ack}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Instance Detail Table (bottom section from DBA Dash) */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Per-Instance Status</h2>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Instance suchen..."
              className="bg-white/5 border border-white/10 rounded-lg pl-8 pr-8 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 w-48"
            />
            {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2"><X className="w-3 h-3 text-gray-500" /></button>}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-800/80 sticky top-0 z-10">
                {DETAIL_COLS.map(col => (
                  <th
                    key={col.key + col.label}
                    onClick={() => handleSort(col.key)}
                    className="px-2 py-2 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white whitespace-pre-line select-none"
                  >
                    <span className="inline-flex items-center gap-0.5">
                      {col.label}
                      {sortKey === col.key && (sortAsc ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((row, _i) => (
                <tr key={row.InstanceID || i} className="hover:bg-white/5 transition-colors">
                  {DETAIL_COLS.map(col => {
                    if (col.key === 'InstanceDisplayName') {
                      return (
                        <td key={col.key} className="px-2 py-1.5 text-left whitespace-nowrap">
                          <Link to={`/instances/${row.InstanceID}`} className="text-blue-400 hover:text-blue-300 text-xs font-medium">
                            {row.InstanceDisplayName || row.Instance || `Instance ${row.InstanceID}`}
                          </Link>
                        </td>
                      );
                    }
                    const val = row[col.key] != null ? Number(row[col.key]) : null;
                    const bg = statusColor(val);
                    return (
                      <td key={col.key + col.label} className={clsx('px-2 py-1.5 text-center text-[10px] font-medium', bg)}>
                        {statusLabel(val)}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={DETAIL_COLS.length} className="py-8 text-center text-gray-500">
                  {search ? 'Keine Instanzen gefunden' : 'Keine Daten'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
