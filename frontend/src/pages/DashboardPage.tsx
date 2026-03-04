import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/api';
import { motion } from 'framer-motion';
import { Server, CheckCircle, AlertTriangle, XCircle, Briefcase, Bell } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
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
  const healthy = summary.filter(s => getOverallStatus(s) === 1).length;
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

      {/* Instance Heatmap */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-3">Instance Overview</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {summary.map((inst, i) => {
            const status = getOverallStatus(inst);
            const borderColor = status === 4 ? 'border-red-500/40' : status === 2 ? 'border-yellow-500/40' : 'border-emerald-500/40';
            const glowColor = status === 4 ? 'hover:shadow-red-500/10' : status === 2 ? 'hover:shadow-yellow-500/10' : 'hover:shadow-emerald-500/10';
            const dotColor = status === 4 ? 'bg-red-500' : status === 2 ? 'bg-yellow-500' : 'bg-emerald-500';
            return (
              <motion.div
                key={inst.InstanceID || i}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => inst.InstanceID && navigate(`/instances/${inst.InstanceID}`)}
                className={clsx(
                  'glass rounded-xl p-4 cursor-pointer transition-all border hover:shadow-lg',
                  borderColor, glowColor
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={clsx('w-2 h-2 rounded-full', dotColor)} />
                  <span className="text-xs font-medium text-white truncate">
                    {inst.InstanceDisplayName || inst.ConnectionID || 'Unknown'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={status} size="xs" />
                </div>
              </motion.div>
            );
          })}
          {summary.length === 0 && (
            <div className="col-span-full text-center py-8 text-gray-500">
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
            {alerts.slice(0, 10).map((a, i) => (
              <div key={i} className="flex items-start gap-3 p-2 rounded-lg hover:bg-white/5">
                <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
                <div className="text-xs text-gray-300 truncate">{JSON.stringify(a).slice(0, 120)}</div>
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
            {failures.slice(0, 10).map((j, i) => (
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

