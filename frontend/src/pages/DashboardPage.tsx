import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/api';
import { motion } from 'framer-motion';
import { Server, CheckCircle, AlertTriangle, XCircle, Briefcase, Bell } from 'lucide-react';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import { clsx } from 'clsx';
import { format } from 'date-fns';

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

const statusColor = (s: number) => s === 4 ? 'bg-red-500' : s === 2 ? 'bg-yellow-500' : s === 3 ? 'bg-gray-500' : 'bg-emerald-500';
const statusBorder = (s: number) => s === 4 ? 'border-red-500/40' : s === 2 ? 'border-yellow-500/40' : 'border-emerald-500/40';

const statusDetailFields = [
  { key: 'FullBackupStatus', label: 'Backup' },
  { key: 'DriveStatus', label: 'Drives' },
  { key: 'JobStatus', label: 'Jobs' },
  { key: 'AGStatus', label: 'AG' },
  { key: 'CorruptionStatus', label: 'Corruption' },
  { key: 'LastGoodCheckDBStatus', label: 'DBCC' },
  { key: 'LogBackupStatus', label: 'Log' },
];

const statusLabel = (v: number) => v === 1 ? '✓' : v === 2 ? '⚠' : v === 4 ? '✗' : '—';

export default function DashboardPage() {
  const [summary, setSummary] = useState<any[]>([]);
  const [failures, setFailures] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const [s, f, a] = await Promise.all([
          api.dashboardSummary().catch(() => []),
          api.jobsFailures().catch(() => []),
          api.alertsRecent().catch(() => []),
        ]);
        setSummary(Array.isArray(s) ? s : []);
        setFailures(Array.isArray(f) ? f : []);
        setAlerts(Array.isArray(a) ? a : []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingSpinner text="Loading dashboard..." />;

  const total = summary.length;
  const healthy = summary.filter(s => {
    const st = getOverallStatus(s);
    return st === 1 || st === 3;
  }).length;
  const warning = summary.filter(s => getOverallStatus(s) === 2).length;
  const critical = summary.filter(s => getOverallStatus(s) === 4).length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Dashboard</h1>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard title="Total Instances" value={total} icon={Server} color="text-blue-400" />
        <StatCard title="Healthy" value={healthy} icon={CheckCircle} color="text-emerald-400" />
        <StatCard title="Warning" value={warning} icon={AlertTriangle} color="text-yellow-400" />
        <StatCard title="Critical" value={critical} icon={XCircle} color="text-red-400" />
        <StatCard title="Failed Jobs (24h)" value={failures.length} icon={Briefcase} color="text-orange-400" />
      </div>

      {/* Heatmap Grid */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-3">Instance Heatmap</h2>
        <div className="flex flex-wrap gap-1.5">
          {summary.map((inst, i) => {
            const status = getOverallStatus(inst);
            return (
              <motion.div
                key={inst.InstanceID || i}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.02 }}
                onClick={() => inst.InstanceID && navigate(`/instances/${inst.InstanceID}`)}
                className={clsx(
                  'w-12 h-12 rounded-lg cursor-pointer transition-all border flex items-center justify-center group relative',
                  statusBorder(status), 'hover:scale-110 hover:z-10'
                )}
                title={`${inst.InstanceDisplayName || inst.ConnectionID || 'Unknown'}\n${statusDetailFields.map(f => `${f.label}: ${statusLabel(inst[f.key] || 3)}`).join('\n')}`}
              >
                <div className={clsx('w-4 h-4 rounded-full', statusColor(status))} />
                {/* Tooltip */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50">
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
      </div>

      {/* Bottom panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Alerts */}
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Bell className="w-4 h-4 text-yellow-400" />
            Recent Alerts
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {alerts.slice(0, 5).map((a, i) => (
              <div key={i} className="flex items-start gap-3 p-2 rounded-lg hover:bg-white/5">
                <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-white truncate">{a.ErrorMessage || a.message || JSON.stringify(a).slice(0, 120)}</p>
                  <p className="text-[10px] text-gray-500">
                    {a.ErrorDate || a.timestamp || ''} {a.ErrorContext || a.InstanceDisplayName ? `· ${a.ErrorContext || a.InstanceDisplayName}` : ''}
                  </p>
                </div>
              </div>
            ))}
            {alerts.length === 0 && <p className="text-xs text-gray-500">No recent alerts</p>}
          </div>
        </div>

        {/* Failed Jobs */}
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-400" />
            Failed Jobs (24h)
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {failures.slice(0, 5).map((j, i) => (
              <div key={i} className="flex items-start gap-3 p-2 rounded-lg hover:bg-white/5">
                <XCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white truncate">{j.step_name || j.job_id}</p>
                  <p className="text-[10px] text-gray-500">{j.InstanceDisplayName} · {j.RunDateTime ? format(new Date(j.RunDateTime), 'MMM d HH:mm') : ''}</p>
                </div>
              </div>
            ))}
            {failures.length === 0 && <p className="text-xs text-gray-500">No failed jobs</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
