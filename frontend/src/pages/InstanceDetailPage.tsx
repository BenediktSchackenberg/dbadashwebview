import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/api';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import StatusBadge from '../components/StatusBadge';
import CapacityBar from '../components/CapacityBar';
import TabNav from '../components/TabNav';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import { motion } from 'framer-motion';
import { Server, Cpu, HardDrive, Clock } from 'lucide-react';
import { clsx } from 'clsx';
import { format } from 'date-fns';

export default function InstanceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const instanceId = parseInt(id!);
  const [tab, setTab] = useState('overview');
  const [detail, setDetail] = useState<any>(null);
  const [cpu, setCpu] = useState<any[]>([]);
  const [waits, setWaits] = useState<any[]>([]);
  const [drives, setDrives] = useState<any[]>([]);
  const [databases, setDatabases] = useState<any[]>([]);
  const [backups, setBackups] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [d, c, w, dr, db, b, j] = await Promise.all([
          api.instance(instanceId).catch(() => null),
          api.instanceCpu(instanceId).catch(() => []),
          api.instanceWaits(instanceId).catch(() => []),
          api.instanceDrives(instanceId).catch(() => []),
          api.instanceDatabases(instanceId).catch(() => []),
          api.instanceBackups(instanceId).catch(() => []),
          api.instanceJobs(instanceId).catch(() => []),
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
  }, [instanceId]);

  if (loading) return <LoadingSpinner />;
  if (!detail) return <EmptyState message="Instance not found" />;

  const inst = detail.instance || {};
  const sum = detail.summary || {};

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'performance', label: 'Performance' },
    { key: 'backups', label: 'Backups' },
    { key: 'jobs', label: 'Jobs', count: jobs.length },
    { key: 'databases', label: 'Databases', count: databases.length },
    { key: 'drives', label: 'Drives', count: drives.length },
  ];

  const statusFields = [
    { key: 'FullBackupStatus', label: 'Full Backup' },
    { key: 'LogBackupStatus', label: 'Log Backup' },
    { key: 'DriveStatus', label: 'Drives' },
    { key: 'JobStatus', label: 'Jobs' },
    { key: 'AGStatus', label: 'AG' },
    { key: 'CorruptionStatus', label: 'Corruption' },
    { key: 'LastGoodCheckDBStatus', label: 'DBCC' },
  ];

  const formatBytes = (b: number) => {
    if (!b) return '—';
    if (b > 1e12) return `${(b / 1e12).toFixed(1)} TB`;
    if (b > 1e9) return `${(b / 1e9).toFixed(1)} GB`;
    return `${(b / 1e6).toFixed(1)} MB`;
  };

  const jobStatusLabel = (s: number) => {
    if (s === 0) return { label: 'Failed', color: 'text-red-400 bg-red-400/10' };
    if (s === 1) return { label: 'Succeeded', color: 'text-emerald-400 bg-emerald-400/10' };
    if (s === 2) return { label: 'Retry', color: 'text-yellow-400 bg-yellow-400/10' };
    if (s === 3) return { label: 'Canceled', color: 'text-gray-400 bg-gray-400/10' };
    return { label: 'Unknown', color: 'text-gray-400 bg-gray-400/10' };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass rounded-xl p-6 gradient-border">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
            <Server className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{inst.InstanceDisplayName || inst.ConnectionID}</h1>
            <p className="text-sm text-gray-400">{inst.Edition} · {inst.ProductVersion}</p>
          </div>
        </div>
        <div className="flex gap-6 mt-4 text-xs text-gray-400">
          {inst.cpu_count && <span className="flex items-center gap-1"><Cpu className="w-3.5 h-3.5" /> {inst.cpu_count} CPUs</span>}
          {inst.physical_memory_kb && <span>{(inst.physical_memory_kb / 1048576).toFixed(1)} GB RAM</span>}
          {inst.sqlserver_start_time && <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Started {format(new Date(inst.sqlserver_start_time), 'MMM d, yyyy HH:mm')}</span>}
        </div>
      </div>

      <TabNav tabs={tabs} active={tab} onChange={setTab} />

      {/* Overview */}
      {tab === 'overview' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {statusFields.map(f => (
            <div key={f.key} className="glass rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-2">{f.label}</p>
              <StatusBadge status={sum[f.key] || 3} size="md" />
            </div>
          ))}
        </div>
      )}

      {/* Performance */}
      {tab === 'performance' && (
        <div className="space-y-6">
          <div className="glass rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">CPU Usage (24h)</h3>
            {cpu.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={cpu}>
                  <defs>
                    <linearGradient id="cpuSql" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="cpuOther" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a855f7" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="EventTime" tickFormatter={(v: string) => format(new Date(v), 'HH:mm')} stroke="#4b5563" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 100]} stroke="#4b5563" tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
                  <Area type="monotone" dataKey="SQLProcessCPU" name="SQL CPU" stroke="#3b82f6" fill="url(#cpuSql)" strokeWidth={2} />
                  <Area type="monotone" dataKey="OtherCPU" name="Other CPU" stroke="#a855f7" fill="url(#cpuOther)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <EmptyState message="No CPU data available" />}
          </div>

          <div className="glass rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Top Wait Types (1h)</h3>
            {waits.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(200, waits.length * 35)}>
                <BarChart data={waits} layout="vertical" margin={{ left: 120 }}>
                  <XAxis type="number" stroke="#4b5563" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="WaitType" type="category" stroke="#4b5563" tick={{ fontSize: 10 }} width={120} />
                  <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="TotalWaitMs" name="Wait (ms)" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState message="No wait data available" />}
          </div>
        </div>
      )}

      {/* Backups */}
      {tab === 'backups' && (
        <div className="glass rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Database</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Start</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Size</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {backups.map((b, i) => (
                <tr key={i} className="hover:bg-white/5">
                  <td className="px-4 py-2.5 text-white">{b.DatabaseName}</td>
                  <td className="px-4 py-2.5">
                    <span className={clsx('text-xs px-2 py-0.5 rounded',
                      b.type === 'D' ? 'bg-blue-400/10 text-blue-400' :
                      b.type === 'I' ? 'bg-purple-400/10 text-purple-400' :
                      'bg-cyan-400/10 text-cyan-400'
                    )}>{b.type === 'D' ? 'Full' : b.type === 'I' ? 'Diff' : b.type === 'L' ? 'Log' : b.type || '—'}</span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{b.backup_start_date ? format(new Date(b.backup_start_date), 'MMM d HH:mm') : '—'}</td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{formatBytes(b.compressed_backup_size || b.backup_size)}</td>
                </tr>
              ))}
              {backups.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No backup data</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Jobs */}
      {tab === 'jobs' && (
        <div className="glass rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Step</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Time</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {jobs.map((j, i) => {
                const s = jobStatusLabel(j.run_status);
                return (
                  <tr key={i} className="hover:bg-white/5">
                    <td className="px-4 py-2.5">
                      <span className={clsx('text-xs px-2 py-0.5 rounded', s.color)}>{s.label}</span>
                    </td>
                    <td className="px-4 py-2.5 text-white text-xs">{j.step_name || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs">{j.RunDateTime ? format(new Date(j.RunDateTime), 'MMM d HH:mm') : '—'}</td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs">{j.RunDurationSec != null ? `${j.RunDurationSec}s` : '—'}</td>
                  </tr>
                );
              })}
              {jobs.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No job data</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Databases */}
      {tab === 'databases' && (
        <div className="glass rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">State</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Recovery</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Last DBCC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {databases.map((d, i) => (
                <tr key={i} className="hover:bg-white/5">
                  <td className="px-4 py-2.5 text-white">{d.name}</td>
                  <td className="px-4 py-2.5">
                    <span className={clsx('text-xs px-2 py-0.5 rounded',
                      d.state === 0 ? 'bg-emerald-400/10 text-emerald-400' : 'bg-yellow-400/10 text-yellow-400'
                    )}>{d.state === 0 ? 'Online' : d.state === 1 ? 'Restoring' : `State ${d.state}`}</span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">
                    {d.recovery_model === 1 ? 'Full' : d.recovery_model === 2 ? 'Bulk-Logged' : d.recovery_model === 3 ? 'Simple' : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">
                    {d.LastGoodCheckDbTime ? format(new Date(d.LastGoodCheckDbTime), 'MMM d, yyyy HH:mm') : '—'}
                  </td>
                </tr>
              ))}
              {databases.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No databases</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Drives */}
      {tab === 'drives' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {drives.map((d, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="glass rounded-xl p-5"
            >
              <div className="flex items-center gap-3 mb-3">
                <HardDrive className="w-5 h-5 text-blue-400" />
                <div>
                  <p className="text-sm font-medium text-white">{d.Name}</p>
                  {d.Label && <p className="text-xs text-gray-500">{d.Label}</p>}
                </div>
              </div>
              <CapacityBar used={(d.Capacity || 0) - (d.FreeSpace || 0)} total={d.Capacity || 0} />
              <div className="flex justify-between mt-2 text-xs text-gray-500">
                <span>{formatBytes(d.FreeSpace)} free</span>
                <span>{formatBytes(d.Capacity)} total</span>
              </div>
            </motion.div>
          ))}
          {drives.length === 0 && <EmptyState message="No drive data" />}
        </div>
      )}
    </div>
  );
}
