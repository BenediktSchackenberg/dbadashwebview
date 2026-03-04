import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/api';
import { useRefresh } from '../App';
import LoadingSpinner from '../components/LoadingSpinner';
import StatCard from '../components/StatCard';
import { Network, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

export default function EstateAGsPage() {
  const { lastRefresh } = useRefresh();
  const navigate = useNavigate();
  const [ags, setAgs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.availabilityGroups().then(d => setAgs(Array.isArray(d) ? d : []))
      .catch(() => setAgs([]))
      .finally(() => setLoading(false));
  }, [lastRefresh]);

  const stats = useMemo(() => {
    const total = ags.length;
    const healthy = ags.filter(a => a.synchronization_health === 2 || a.SyncHealth === 'HEALTHY').length;
    const warning = ags.filter(a => a.synchronization_health === 1 || a.SyncHealth === 'PARTIALLY_HEALTHY').length;
    const critical = total - healthy - warning;
    return { total, healthy, warning, critical: Math.max(0, critical) };
  }, [ags]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Estate Availability Groups</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total AGs" value={stats.total} icon={Network} color="text-blue-400" />
        <StatCard title="Healthy" value={stats.healthy} icon={CheckCircle} color="text-emerald-400" />
        <StatCard title="Warning" value={stats.warning} icon={AlertTriangle} color="text-yellow-400" />
        <StatCard title="Critical" value={stats.critical} icon={XCircle} color="text-red-400" />
      </div>

      <div className="glass rounded-xl p-5 gradient-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left">
              <th className="pb-3 text-gray-400 font-medium">AG Name</th>
              <th className="pb-3 text-gray-400 font-medium">Primary</th>
              <th className="pb-3 text-gray-400 font-medium text-center">Secondaries</th>
              <th className="pb-3 text-gray-400 font-medium">Sync Health</th>
              <th className="pb-3 text-gray-400 font-medium">Failover Ready</th>
            </tr>
          </thead>
          <tbody>
            {ags.map((ag, i) => {
              const syncHealth = ag.synchronization_health === 2 || ag.SyncHealth === 'HEALTHY' ? 'Healthy'
                : ag.synchronization_health === 1 || ag.SyncHealth === 'PARTIALLY_HEALTHY' ? 'Warning' : 'Critical';
              const syncColor = syncHealth === 'Healthy' ? 'text-emerald-400' : syncHealth === 'Warning' ? 'text-yellow-400' : 'text-red-400';
              const failoverReady = ag.is_failover_ready ?? ag.FailoverReady ?? false;
              return (
                <tr key={i}
                  onClick={() => navigate('/availability-groups')}
                  className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors">
                  <td className="py-3 text-blue-400 font-medium">{ag.ag_name || ag.AGName || ag.name || '—'}</td>
                  <td className="py-3 text-gray-300">{ag.InstanceDisplayName || '—'}</td>
                  <td className="py-3 text-gray-400 text-center">{ag.secondary_count ?? ag.SecondariesCount ?? '—'}</td>
                  <td className={`py-3 font-medium ${syncColor}`}>{syncHealth}</td>
                  <td className="py-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${failoverReady ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                      {failoverReady ? 'Yes' : 'No'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {ags.length === 0 && <p className="text-gray-500 text-sm py-4 text-center">No availability groups found.</p>}
      </div>
    </div>
  );
}
