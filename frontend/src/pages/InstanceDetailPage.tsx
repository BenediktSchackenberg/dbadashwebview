import { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/api';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import StatusBadge from '../components/StatusBadge';
import CapacityBar from '../components/CapacityBar';
import TabNav from '../components/TabNav';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Server, Cpu, HardDrive, Database, Activity, Clock, Shield,
  ChevronRight, Zap, BarChart3, Timer, AlertTriangle
} from 'lucide-react';
import TimeRangeSelector, { hoursLabel } from '../components/TimeRangeSelector';
import { SUMMARY_STATUS_KEYS } from '../constants/summaryStatusKeys';
import { clsx } from 'clsx';
import { format, formatDistanceToNow } from 'date-fns';

// ── Helpers ──────────────────────────────────────────────────────────────

function backupAgeColor(date: string | null, type: 'full' | 'log') {
  if (!date) return 'text-gray-500';
  const hours = (Date.now() - new Date(date).getTime()) / 3600000;
  if (type === 'log') return hours < 1 ? 'text-emerald-400' : hours < 4 ? 'text-yellow-400' : 'text-red-400';
  return hours < 24 ? 'text-emerald-400' : hours < 48 ? 'text-yellow-400' : 'text-red-400';
}

function formatBytes(b: number) {
  if (!b) return '—';
  if (b > 1e12) return `${(b / 1e12).toFixed(1)} TB`;
  if (b > 1e9) return `${(b / 1e9).toFixed(1)} GB`;
  return `${(b / 1e6).toFixed(1)} MB`;
}

const recoveryLabel = (rm: number) => rm === 1 ? 'Full' : rm === 2 ? 'Bulk-Logged' : rm === 3 ? 'Simple' : '—';

const jobStatusLabel = (s: number) => {
  if (s === 0) return { label: 'Failed', color: 'text-red-400 bg-red-400/10', dot: 'bg-red-400' };
  if (s === 1) return { label: 'Succeeded', color: 'text-emerald-400 bg-emerald-400/10', dot: 'bg-emerald-400' };
  if (s === 2) return { label: 'Retry', color: 'text-yellow-400 bg-yellow-400/10', dot: 'bg-yellow-400' };
  if (s === 3) return { label: 'Canceled', color: 'text-gray-400 bg-gray-400/10', dot: 'bg-gray-400' };
  return { label: 'Unknown', color: 'text-gray-400 bg-gray-400/10', dot: 'bg-gray-400' };
};

const syncStateLabel = (s: number | null) => {
  if (s === 0) return { text: 'Not Syncing', cls: 'text-red-400' };
  if (s === 1) return { text: 'Synchronizing', cls: 'text-yellow-400' };
  if (s === 2) return { text: 'Synchronized', cls: 'text-emerald-400' };
  if (s === 3) return { text: 'Reverting', cls: 'text-orange-400' };
  if (s === 4) return { text: 'Initializing', cls: 'text-blue-400' };
  return { text: '—', cls: 'text-gray-500' };
};

// ── Component ────────────────────────────────────────────────────────────

export default function InstanceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const instanceId = parseInt(id!);
  const [tab, setTab] = useState('performance');
  const [showAllChecks, setShowAllChecks] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [cpu, setCpu] = useState<any[]>([]);
  const [waits, setWaits] = useState<any[]>([]);
  const [drives, setDrives] = useState<any[]>([]);
  const [databases, setDatabases] = useState<any[]>([]);
  const [backups, setBackups] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [jobFilter, setJobFilter] = useState<'all' | 'failed' | 'success'>('all');
  const [hours, setHours] = useState(24);

  useEffect(() => {
    (async () => {
      try {
        const [d, c, w, dr, db, b, j] = await Promise.all([
          api.instance(instanceId).catch(() => null),
          api.instanceCpu(instanceId, hours).catch(() => []),
          api.instanceWaits(instanceId, hours, 2000).catch(() => []),
          api.instanceDrives(instanceId).catch(() => []),
          api.instanceDatabases(instanceId).catch(() => []),
          api.instanceBackups(instanceId).catch(() => []),
          api.instanceJobs(instanceId, 10_000, 0).catch(() => []),
        ]);
        setDetail(d);
        setCpu(Array.isArray(c) ? c.reverse() : []);
        setWaits(Array.isArray(w) ? w : []);
        setDrives(Array.isArray(dr) ? dr : []);
        setDatabases(Array.isArray(db) ? db : []);
        setBackups(Array.isArray(b) ? b : []);
        setJobs(Array.isArray(j) ? j : []);
      } finally {
        setLoading(false);
      }
    })();
  }, [instanceId, hours]);

  // ── Derived data ───────────────────────────────────────────────────────

  const inst = detail?.instance || {};
  const sum = detail?.summary || {};

  const headerStatusFields = [
    { key: 'FullBackupStatus', label: 'Full Backup', icon: Shield },
    { key: 'LogBackupStatus', label: 'Log Backup', icon: Timer },
    { key: 'LastGoodCheckDBStatus', label: 'DBCC', icon: Database },
    { key: 'DriveStatus', label: 'Drives', icon: HardDrive },
    { key: 'JobStatus', label: 'Jobs', icon: Zap },
    { key: 'AGStatus', label: 'AG', icon: Activity },
    { key: 'CorruptionStatus', label: 'Corruption', icon: AlertTriangle },
  ];

  const backupsByDb = useMemo(() => {
    const map = new Map<string, { name: string; DatabaseID: number; full: any; diff: any; log: any }>();
    for (const b of backups) {
      const key = b.DatabaseName || b.DatabaseID;
      if (!map.has(key)) map.set(key, { name: b.DatabaseName, DatabaseID: b.DatabaseID, full: null, diff: null, log: null });
      const entry = map.get(key)!;
      const date = b.backup_start_date ? new Date(b.backup_start_date).getTime() : 0;
      if (b.type === 'D' && (!entry.full || date > new Date(entry.full.backup_start_date).getTime())) entry.full = b;
      if (b.type === 'I' && (!entry.diff || date > new Date(entry.diff.backup_start_date).getTime())) entry.diff = b;
      if (b.type === 'L' && (!entry.log || date > new Date(entry.log.backup_start_date).getTime())) entry.log = b;
    }
    return Array.from(map.values());
  }, [backups]);

  // Merge AG info from databases into backups
  const dbAgMap = useMemo(() => {
    const m = new Map<number, { isPrimary: boolean | null; agName: string | null }>();
    for (const d of databases) {
      m.set(d.DatabaseID, {
        isPrimary: d.is_primary_replica != null ? Boolean(d.is_primary_replica) : null,
        agName: d.ag_name || null,
      });
    }
    return m;
  }, [databases]);

  const filteredJobs = jobFilter === 'all' ? jobs : jobFilter === 'failed' ? jobs.filter(j => j.run_status === 0) : jobs.filter(j => j.run_status === 1);
  const failedJobCount = jobs.filter(j => j.run_status === 0).length;

  // CPU stats
  const cpuStats = useMemo(() => {
    if (cpu.length === 0) return null;
    const vals = cpu.map(c => c.SQLProcessCPU ?? 0);
    return {
      avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
      max: Math.max(...vals),
      current: vals[vals.length - 1],
    };
  }, [cpu]);

  const tabs = [
    { key: 'performance', label: 'Performance' },
    { key: 'backups', label: 'Backups', count: backupsByDb.length },
    { key: 'jobs', label: 'Jobs', count: failedJobCount > 0 ? failedJobCount : jobs.length },
    { key: 'databases', label: 'Databases', count: databases.length },
    { key: 'drives', label: 'Drives', count: drives.length },
  ];

  if (loading) return <LoadingSpinner />;
  if (!detail) return <EmptyState message="Instance not found" />;

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl p-6 gradient-border">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center border border-blue-500/20">
              <Server className="w-7 h-7 text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                {inst.InstanceDisplayName || inst.ConnectionID}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-gray-400">{inst.Edition}</span>
                <span className="text-gray-600">·</span>
                <span className="text-sm font-mono text-gray-500">{inst.ProductVersion}</span>
              </div>
            </div>
          </div>
          <div className="text-right text-xs text-gray-500 space-y-1">
            {inst.LastCollected && (
              <p className="flex items-center gap-1 justify-end">
                <Activity className="w-3 h-3 text-emerald-400" />
                <span>{formatDistanceToNow(new Date(inst.LastCollected), { addSuffix: true })}</span>
              </p>
            )}
            {inst.sqlserver_start_time && (
              <p className="flex items-center gap-1 justify-end">
                <Clock className="w-3 h-3" />
                <span>Up {formatDistanceToNow(new Date(inst.sqlserver_start_time))}</span>
              </p>
            )}
          </div>
        </div>

        {/* Inline stats */}
        <div className="grid grid-cols-4 gap-4 mt-5 pt-5 border-t border-white/5">
          <div>
            <p className="text-[11px] text-gray-500 uppercase tracking-wider">CPUs</p>
            <p className="text-lg font-semibold text-white mt-0.5">{inst.cpu_count ?? '—'}</p>
          </div>
          <div>
            <p className="text-[11px] text-gray-500 uppercase tracking-wider">Memory</p>
            <p className="text-lg font-semibold text-white mt-0.5">{inst.physical_memory_kb ? `${(inst.physical_memory_kb / 1048576).toFixed(0)} GB` : '—'}</p>
          </div>
          <div>
            <p className="text-[11px] text-gray-500 uppercase tracking-wider">Databases</p>
            <p className="text-lg font-semibold text-white mt-0.5">{databases.length}</p>
          </div>
          <div>
            <p className="text-[11px] text-gray-500 uppercase tracking-wider">SQL CPU (avg)</p>
            <p className={clsx('text-lg font-semibold mt-0.5',
              cpuStats ? (cpuStats.avg > 50 ? 'text-red-400' : cpuStats.avg > 25 ? 'text-yellow-400' : 'text-emerald-400') : 'text-gray-500'
            )}>{cpuStats ? `${cpuStats.avg}%` : '—'}</p>
          </div>
        </div>

        {/* Status badges row */}
        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-white/5">
          {headerStatusFields.map(f => {
            const val = sum[f.key] != null ? Number(sum[f.key]) : null;
            if (val === null || val === 3) return null; // skip N/A
            return (
              <div key={f.key} className="flex items-center gap-1.5">
                <StatusBadge status={val} label={f.label} size="xs" />
              </div>
            );
          })}
          {headerStatusFields.every(f => {
            const val = sum[f.key] != null ? Number(sum[f.key]) : null;
            return val === null || val === 3;
          }) && <span className="text-xs text-gray-500 italic">No status data from Summary_Get</span>}
        </div>

        <button
          type="button"
          onClick={() => setShowAllChecks(v => !v)}
          className="mt-3 text-xs text-blue-400 hover:text-blue-300"
        >
          {showAllChecks ? 'Hide' : 'Show'} all Summary_Get checks ({SUMMARY_STATUS_KEYS.length})
        </button>
        {showAllChecks && (
          <div className="mt-3 glass rounded-xl overflow-hidden border border-white/5">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/10 text-gray-400 text-left">
                  <th className="px-3 py-2 font-semibold">Check</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {SUMMARY_STATUS_KEYS.map(({ key, label }) => {
                  const raw = sum[key];
                  const val = raw == null ? null : Number(raw);
                  return (
                    <tr key={key} className="border-b border-white/5">
                      <td className="px-3 py-1.5 text-gray-300">{label}</td>
                      <td className="px-3 py-1.5">
                        {val == null ? <span className="text-gray-500">—</span> : <StatusBadge status={val} label="" size="xs" />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <TabNav tabs={tabs} active={tab} onChange={setTab} />

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>

          {/* ── Performance ──────────────────────────────────────────────── */}
          {tab === 'performance' && (
            <div className="space-y-6">
              {/* CPU KPIs */}
              {cpuStats && (
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: 'Current CPU', value: `${cpuStats.current}%`, color: cpuStats.current > 50 ? 'text-red-400' : cpuStats.current > 25 ? 'text-yellow-400' : 'text-emerald-400' },
                    { label: 'Avg (24h)', value: `${cpuStats.avg}%`, color: cpuStats.avg > 50 ? 'text-red-400' : cpuStats.avg > 25 ? 'text-yellow-400' : 'text-emerald-400' },
                    { label: 'Peak (24h)', value: `${cpuStats.max}%`, color: cpuStats.max > 80 ? 'text-red-400' : cpuStats.max > 50 ? 'text-yellow-400' : 'text-emerald-400' },
                  ].map((k, i) => (
                    <motion.div key={k.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                      className="glass rounded-xl p-5">
                      <p className="text-[11px] text-gray-500 uppercase tracking-wider">{k.label}</p>
                      <p className={clsx('text-2xl font-bold mt-1', k.color)}>{k.value}</p>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* CPU Chart */}
              <div className="glass rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-blue-400" /> CPU Usage ({hoursLabel(hours)})
                  </h3>
                  <TimeRangeSelector value={hours} onChange={setHours} />
                </div>
                {cpu.length > 0 ? (
                  <ResponsiveContainer width="100%" height={320}>
                    <AreaChart data={cpu}>
                      <defs>
                        <linearGradient id="cpuSql" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="cpuOther" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f97316" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="EventTime" tickFormatter={(v: string) => format(new Date(v), 'HH:mm')} stroke="#374151" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} stroke="#374151" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}%`} />
                      <Tooltip
                        contentStyle={{ background: 'rgba(17,24,39,0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, fontSize: 12, backdropFilter: 'blur(12px)' }}
                        labelFormatter={(v) => format(new Date(v as string), 'HH:mm:ss')}
                        formatter={(value, name) => [`${value}%`, name as string]}
                      />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                      <Area type="monotone" dataKey="SQLProcessCPU" name="SQL CPU" stroke="#3b82f6" fill="url(#cpuSql)" strokeWidth={2} dot={false} />
                      <Area type="monotone" dataKey="OtherCPU" name="Other CPU" stroke="#f97316" fill="url(#cpuOther)" strokeWidth={1.5} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : <EmptyState message="No CPU data available" />}
              </div>

              {/* Waits */}
              <div className="glass rounded-2xl p-6">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-amber-400" /> Top Wait Types (1h)
                </h3>
                {waits.length > 0 ? (
                  <ResponsiveContainer width="100%" height={Math.max(200, waits.slice(0, 10).length * 38)}>
                    <BarChart data={waits.slice(0, 10)} layout="vertical" margin={{ left: 140 }}>
                      <XAxis type="number" stroke="#374151" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                      <YAxis dataKey="WaitType" type="category" stroke="#374151" tick={{ fontSize: 11, fill: '#9ca3af' }} width={140} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ background: 'rgba(17,24,39,0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, fontSize: 12 }} />
                      <Bar dataKey="TotalWaitMs" name="Wait (ms)" fill="#f59e0b" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyState message="No wait data available" />}
              </div>
            </div>
          )}

          {/* ── Backups ──────────────────────────────────────────────────── */}
          {tab === 'backups' && (
            <div className="glass rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/5">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-blue-400" /> Backup Status per Database
                </h3>
                <p className="text-xs text-gray-500 mt-1">AG Secondary databases show "via Primary" — backups run on the preferred replica</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Database</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">AG Role</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Full Backup</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Diff Backup</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Log Backup</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {backupsByDb.map((b, i) => {
                    const agInfo = dbAgMap.get(b.DatabaseID);
                    const isSecondary = agInfo?.isPrimary === false;
                    return (
                      <motion.tr key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                        className={clsx('hover:bg-white/[0.03] transition-colors', isSecondary && 'opacity-50')}>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <Database className="w-3.5 h-3.5 text-gray-500" />
                            <span className="text-white font-medium">{b.name}</span>
                            {agInfo?.agName && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400/70 border border-blue-500/10">{agInfo.agName}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          {agInfo?.isPrimary == null ? <span className="text-gray-600 text-xs">—</span> :
                           isSecondary ? <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">Secondary</span> :
                           <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Primary</span>}
                        </td>
                        <td className="px-5 py-3">
                          {isSecondary ? (
                            <span className="text-xs text-gray-600 italic">via Primary</span>
                          ) : b.full?.backup_start_date ? (
                            <div>
                              <span className={clsx('text-xs font-medium', backupAgeColor(b.full.backup_start_date, 'full'))}>
                                {format(new Date(b.full.backup_start_date), 'MMM d HH:mm')}
                              </span>
                              <span className="text-[10px] text-gray-600 ml-1.5">
                                ({formatDistanceToNow(new Date(b.full.backup_start_date), { addSuffix: true })})
                              </span>
                            </div>
                          ) : <span className="text-xs text-red-400/70">No backup</span>}
                        </td>
                        <td className="px-5 py-3">
                          {isSecondary ? <span className="text-xs text-gray-600">—</span> :
                           b.diff?.backup_start_date ? (
                            <span className="text-xs text-gray-400">{format(new Date(b.diff.backup_start_date), 'MMM d HH:mm')}</span>
                          ) : <span className="text-xs text-gray-600">—</span>}
                        </td>
                        <td className="px-5 py-3">
                          {isSecondary ? (
                            <span className="text-xs text-gray-600 italic">via Primary</span>
                          ) : b.log?.backup_start_date ? (
                            <span className={clsx('text-xs font-medium', backupAgeColor(b.log.backup_start_date, 'log'))}>
                              {format(new Date(b.log.backup_start_date), 'MMM d HH:mm')}
                            </span>
                          ) : <span className="text-xs text-gray-600">—</span>}
                        </td>
                      </motion.tr>
                    );
                  })}
                  {backupsByDb.length === 0 && <tr><td colSpan={5} className="px-5 py-12 text-center text-gray-500">No backup data</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Jobs ─────────────────────────────────────────────────────── */}
          {tab === 'jobs' && (
            <div className="space-y-4">
              <TabNav
                tabs={[
                  { key: 'all', label: 'All', count: jobs.length },
                  { key: 'failed', label: 'Failed', count: failedJobCount },
                  { key: 'success', label: 'Success', count: jobs.filter(j => j.run_status === 1).length },
                ]}
                active={jobFilter}
                onChange={(k) => setJobFilter(k as 'all' | 'failed' | 'success')}
              />
              <div className="glass rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-24">Status</th>
                      <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Job / Step</th>
                      <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Time</th>
                      <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Duration</th>
                      <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredJobs.map((j, i) => {
                      const s = jobStatusLabel(j.run_status);
                      return (
                        <motion.tr key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.015 }}
                          className="hover:bg-white/[0.03] transition-colors">
                          <td className="px-5 py-3">
                            <span className={clsx('inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium', s.color)}>
                              <span className={clsx('w-1.5 h-1.5 rounded-full', s.dot)} />
                              {s.label}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-white text-xs font-medium">{j.step_name || '—'}</td>
                          <td className="px-5 py-3 text-gray-400 text-xs">{j.RunDateTime ? format(new Date(j.RunDateTime), 'MMM d HH:mm') : '—'}</td>
                          <td className="px-5 py-3 text-gray-400 text-xs font-mono">{j.RunDurationSec != null ? `${j.RunDurationSec}s` : '—'}</td>
                          <td className="px-5 py-3 text-gray-500 text-xs max-w-xs truncate">{j.message || '—'}</td>
                        </motion.tr>
                      );
                    })}
                    {filteredJobs.length === 0 && <tr><td colSpan={5} className="px-5 py-12 text-center text-gray-500">No jobs</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Databases ────────────────────────────────────────────────── */}
          {tab === 'databases' && (
            <div className="glass rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Name</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">State</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Recovery</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">AG Role</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Sync</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Last DBCC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {databases.map((d, i) => {
                    const sync = syncStateLabel(d.synchronization_state);
                    const isSecondary = d.is_primary_replica === false || d.is_primary_replica === 0;
                    const isInAG = d.is_primary_replica != null;
                    return (
                      <motion.tr key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.015 }}
                        className="hover:bg-white/[0.03] transition-colors">
                        <td className="px-5 py-3">
                          <Link to={`/instances/${instanceId}/databases/${d.DatabaseID}`}
                            className="text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-2 group">
                            <Database className="w-3.5 h-3.5 text-gray-500 group-hover:text-blue-400 transition-colors" />
                            <span className="font-medium">{d.name}</span>
                            {d.ag_name && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400/60 border border-blue-500/10">{d.ag_name}</span>
                            )}
                            <ChevronRight className="w-3 h-3 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </Link>
                        </td>
                        <td className="px-5 py-3">
                          <span className={clsx('text-xs px-2 py-0.5 rounded-full border font-medium',
                            d.state === 0 ? 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20' :
                            d.state === 1 ? 'bg-yellow-400/10 text-yellow-400 border-yellow-400/20' :
                            'bg-red-400/10 text-red-400 border-red-400/20'
                          )}>{d.state === 0 ? 'Online' : d.state === 1 ? 'Restoring' : d.state === 6 ? 'Offline' : `State ${d.state}`}</span>
                        </td>
                        <td className="px-5 py-3 text-gray-400 text-xs">{recoveryLabel(d.recovery_model)}</td>
                        <td className="px-5 py-3">
                          {!isInAG ? <span className="text-gray-600 text-xs">—</span> :
                           isSecondary ? <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">Secondary</span> :
                           <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Primary</span>}
                        </td>
                        <td className="px-5 py-3">
                          {isInAG ? <span className={clsx('text-xs', sync.cls)}>{sync.text}</span> : <span className="text-gray-600 text-xs">—</span>}
                        </td>
                        <td className="px-5 py-3 text-xs">
                          {d.LastGoodCheckDbTime ? (
                            <div>
                              <span className="text-gray-400">{format(new Date(d.LastGoodCheckDbTime), 'MMM d HH:mm')}</span>
                              <span className="text-[10px] text-gray-600 ml-1">({formatDistanceToNow(new Date(d.LastGoodCheckDbTime), { addSuffix: true })})</span>
                            </div>
                          ) : <span className="text-gray-600">—</span>}
                        </td>
                      </motion.tr>
                    );
                  })}
                  {databases.length === 0 && <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-500">No databases</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Drives ───────────────────────────────────────────────────── */}
          {tab === 'drives' && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {drives.map((d, i) => {
                const usedPct = d.Capacity ? Math.round(((d.Capacity - (d.FreeSpace || 0)) / d.Capacity) * 100) : 0;
                return (
                  <motion.div key={i} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }}
                    className="glass rounded-2xl p-6 hover:bg-white/[0.03] transition-colors">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center',
                          usedPct > 90 ? 'bg-red-500/15' : usedPct > 75 ? 'bg-yellow-500/15' : 'bg-blue-500/15'
                        )}>
                          <HardDrive className={clsx('w-5 h-5',
                            usedPct > 90 ? 'text-red-400' : usedPct > 75 ? 'text-yellow-400' : 'text-blue-400'
                          )} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">{d.Name}</p>
                          {d.Label && <p className="text-xs text-gray-500">{d.Label}</p>}
                        </div>
                      </div>
                      <span className={clsx('text-lg font-bold',
                        usedPct > 90 ? 'text-red-400' : usedPct > 75 ? 'text-yellow-400' : 'text-emerald-400'
                      )}>{usedPct}%</span>
                    </div>
                    <CapacityBar used={(d.Capacity || 0) - (d.FreeSpace || 0)} total={d.Capacity || 0} />
                    <div className="flex justify-between mt-3 text-xs text-gray-500">
                      <span>{formatBytes(d.FreeSpace)} free</span>
                      <span>{formatBytes(d.Capacity)} total</span>
                    </div>
                  </motion.div>
                );
              })}
              {drives.length === 0 && <div className="col-span-full"><EmptyState message="No drive data" /></div>}
            </div>
          )}

        </motion.div>
      </AnimatePresence>
    </div>
  );
}
