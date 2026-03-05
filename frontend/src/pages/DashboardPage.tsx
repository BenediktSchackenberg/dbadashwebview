import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/api';
import type { DashboardStats } from '../api/api';
import { motion } from 'framer-motion';
import {
  Server, CheckCircle, AlertTriangle, XCircle, Briefcase, Bell,
  Database, Activity
} from 'lucide-react';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import { clsx } from 'clsx';
import { format } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from 'recharts';

function getOverallStatus(row: any): number {
  const keys = ['FullBackupStatus', 'DriveStatus', 'JobStatus', 'AGStatus',
    'CorruptionStatus', 'LastGoodCheckDBStatus', 'LogBackupStatus'];
  let worst = 1;
  for (const k of keys) {
    const v = row[k];
    if (v === 4) return 4;
    if (v === 2 && worst < 2) worst = 2;
  }
  return worst;
}

const statusColor = (s: number) =>
  s === 4 ? 'bg-red-500' : s === 2 ? 'bg-amber-500' : s === 3 ? 'bg-gray-500' : 'bg-emerald-500';
const statusBorder = (s: number) =>
  s === 4 ? 'border-red-500/40' : s === 2 ? 'border-amber-500/40' : 'border-emerald-500/40';

const statusDetailFields = [
  { key: 'FullBackupStatus', label: 'Backup' },
  { key: 'DriveStatus', label: 'Drives' },
  { key: 'JobStatus', label: 'Jobs' },
  { key: 'AGStatus', label: 'AG' },
  { key: 'CorruptionStatus', label: 'Corruption' },
  { key: 'LastGoodCheckDBStatus', label: 'DBCC' },
  { key: 'LogBackupStatus', label: 'Log' },
];

function formatSize(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<any[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const [s, st] = await Promise.all([
          api.dashboardSummary().catch(() => []),
          api.dashboardStats().catch(() => null),
        ]);
        setSummary(Array.isArray(s) ? s : []);
        setStats(st);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingSpinner text="Loading dashboard..." />;

  const total = stats?.totalInstances ?? summary.length;
  const healthy = stats?.healthy ?? summary.filter(s => {
    const st = getOverallStatus(s);
    return st === 1 || st === 3;
  }).length;
  const warning = stats?.warning ?? summary.filter(s => getOverallStatus(s) === 2).length;
  const critical = stats?.critical ?? summary.filter(s => getOverallStatus(s) === 4).length;
  const totalDbs = stats?.totalDatabases ?? 0;
  const failedCount = stats?.failedJobs24h ?? 0;

  const cpuData = (stats?.top10Cpu ?? []).map(c => ({
    name: c.instanceName?.length > 20 ? c.instanceName.slice(0, 18) + '..' : c.instanceName,
    fullName: c.instanceName,
    avgCpu: c.avgCpu,
    instanceId: c.instanceId,
  }));

  const alerts = stats?.recentAlerts ?? [];
  const failures = stats?.failedJobs ?? [];
  const largestDbs = stats?.top10LargestDbs ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Dashboard</h1>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <StatCard title="Total Instances" value={total} icon={Server} color="text-blue-400" />
        <StatCard title="Healthy" value={healthy} icon={CheckCircle} color="text-emerald-400" />
        <StatCard title="Warning" value={warning} icon={AlertTriangle} color="text-amber-400" />
        <StatCard title="Critical" value={critical} icon={XCircle} color="text-red-400" />
        <StatCard title="Total Databases" value={totalDbs} icon={Database} color="text-purple-400" />
        <StatCard title="Failed Jobs (24h)" value={failedCount} icon={Briefcase} color="text-orange-400" />
      </div>

      {/* Instance Heatmap */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <h2 className="text-lg font-semibold text-white mb-3">Instance Heatmap</h2>
        <div className="flex flex-wrap gap-1.5">
          {summary.map((inst, i) => {
            const status = getOverallStatus(inst);
            return (
              <motion.div
                key={inst.InstanceID || i}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: Math.min(i * 0.01, 1) }}
                onClick={() => inst.InstanceID && navigate(`/instances/${inst.InstanceID}`)}
                className={clsx(
                  'w-10 h-10 rounded-lg cursor-pointer transition-all border flex items-center justify-center group relative',
                  statusBorder(status), 'hover:scale-125 hover:z-10'
                )}
              >
                <div className={clsx('w-3.5 h-3.5 rounded-full', statusColor(status))} />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 pointer-events-none">
                  <div className="glass-strong rounded-lg p-3 shadow-xl whitespace-nowrap text-xs">
                    <p className="font-medium text-white mb-1.5">{inst.InstanceDisplayName || inst.ConnectionID || 'Unknown'}</p>
                    <div className="space-y-0.5">
                      {statusDetailFields.map(f => (
                        <div key={f.key} className="flex items-center justify-between gap-4">
                          <span className="text-gray-400">{f.label}</span>
                          <StatusBadge status={inst[f.key] || 3} size="xs" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
          {summary.length === 0 && (
            <div className="w-full text-center py-8 text-gray-500">
              No instances found. Check your connection.
            </div>
          )}
        </div>
      </motion.div>

      {/* Middle row: Top 10 CPU + Top 10 Largest DBs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 10 CPU */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="glass rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400" />
            Top 10 Instances by CPU (1h avg)
          </h3>
          {cpuData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(200, cpuData.length * 32)}>
              <BarChart data={cpuData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <XAxis type="number" domain={[0, 100]} stroke="#4b5563" tick={{ fontSize: 10 }} unit="%" />
                <YAxis dataKey="name" type="category" stroke="#4b5563" tick={{ fontSize: 10 }} width={140} />
                <Tooltip
                  contentStyle={{ background: '#1f2937', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                  formatter={(value: any) => [`${value}%`, 'Avg CPU']}
                  labelFormatter={(_: any, payload: any) => payload?.[0]?.payload?.fullName || String(_)}
                />
                <Bar dataKey="avgCpu" radius={[0, 4, 4, 0]} cursor="pointer"
                  onClick={(data: any) => data?.instanceId && navigate(`/instances/${data.instanceId}`)}>
                  {cpuData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.avgCpu > 80 ? '#ef4444' : entry.avgCpu > 50 ? '#f59e0b' : '#3b82f6'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-gray-500 py-4 text-center">No CPU data available</p>
          )}
        </motion.div>

        {/* Top 10 Largest Databases */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="glass rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Database className="w-4 h-4 text-purple-400" />
            Top 10 Largest Databases
          </h3>
          {largestDbs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-300 uppercase">Instance</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-300 uppercase">Database</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-300 uppercase">Size</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {largestDbs.map((db, i) => (
                    <tr key={i} className="hover:bg-slate-800/50">
                      <td className="px-3 py-2 text-xs text-gray-400 truncate max-w-[140px]">{db.instanceName}</td>
                      <td className="px-3 py-2 text-xs text-white">{db.databaseName}</td>
                      <td className="px-3 py-2 text-xs text-right text-emerald-400 font-mono">{formatSize(db.sizeMb)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-gray-500 py-4 text-center">No database size data available</p>
          )}
        </motion.div>
      </div>

      {/* Bottom panels: Alerts + Failed Jobs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Alerts */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="glass rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-400" />
            Recent Alerts
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {alerts.slice(0, 10).map((a: any, i: number) => (
              <div key={i} className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-800/50">
                <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-white truncate">{a.ErrorMessage || a.message || JSON.stringify(a).slice(0, 120)}</p>
                  <p className="text-[10px] text-gray-500">
                    {a.ErrorDate || a.timestamp || ''} {a.ErrorContext ? `· ${a.ErrorContext}` : ''}
                  </p>
                </div>
              </div>
            ))}
            {alerts.length === 0 && <p className="text-xs text-gray-500">No recent alerts</p>}
          </div>
        </motion.div>

        {/* Failed Jobs */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
          className="glass rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-400" />
            Failed Jobs (24h)
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {failures.slice(0, 10).map((j: any, i: number) => (
              <div key={i} className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-800/50">
                <XCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white truncate">{j.step_name || j.job_id}</p>
                  <p className="text-[10px] text-gray-500">
                    {j.InstanceDisplayName} · {j.RunDateTime ? format(new Date(j.RunDateTime), 'MMM d HH:mm') : ''}
                  </p>
                </div>
              </div>
            ))}
            {failures.length === 0 && <p className="text-xs text-gray-500">No failed jobs</p>}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
