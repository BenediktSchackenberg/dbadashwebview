import { useEffect, useState } from 'react';
import { api } from '../api/api';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import StatusBadge from '../components/StatusBadge';
import { motion } from 'framer-motion';
import { Network, ArrowLeft, ArrowDown } from 'lucide-react';
import { clsx } from 'clsx';

function AGDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const d = await api.availabilityGroup(id);
        setData(d);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <LoadingSpinner />;
  if (!data?.ag) return <EmptyState message="AG not found" />;

  const { ag, replicas = [], databases = [] } = data;
  const primary = replicas.find((r: any) => r.Role === 1 || r.role_desc === 'PRIMARY' || r.IsPrimary === true);
  const secondaries = replicas.filter((r: any) => r !== primary);

  const roleLabel = (r: any) => {
    if (r.Role === 1 || r.role_desc === 'PRIMARY' || r.IsPrimary) return 'Primary';
    return 'Secondary';
  };

  const roleBadge = (r: any) => {
    const isPrimary = roleLabel(r) === 'Primary';
    return (
      <span className={clsx('text-xs px-2 py-0.5 rounded font-medium',
        isPrimary ? 'bg-blue-400/10 text-blue-400' : 'bg-gray-400/10 text-gray-400'
      )}>{roleLabel(r)}</span>
    );
  };

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Availability Groups
      </button>

      <div className="glass rounded-xl p-6">
        <div className="flex items-center gap-3">
          <Network className="w-6 h-6 text-blue-400" />
          <h2 className="text-xl font-bold text-white">{ag.AGName || ag.name || `AG ${id}`}</h2>
        </div>
      </div>

      {/* Topology */}
      <div className="glass rounded-xl p-6">
        <h3 className="text-sm font-semibold text-white mb-6">Topology</h3>
        <div className="flex flex-col items-center gap-2">
          {/* Primary */}
          {primary && (
            <div className="glass rounded-xl p-4 border border-blue-500/30 min-w-[220px] text-center">
              <p className="text-sm font-medium text-white">{primary.InstanceDisplayName || primary.ReplicaName || 'Primary'}</p>
              <div className="flex items-center justify-center gap-2 mt-2">
                {roleBadge(primary)}
                <span className="text-xs text-emerald-400">{primary.synchronization_health_desc || primary.SyncState || 'Synchronized'}</span>
              </div>
            </div>
          )}

          {secondaries.length > 0 && (
            <>
              <ArrowDown className="w-5 h-5 text-gray-500" />
              <div className="flex flex-wrap justify-center gap-4">
                {secondaries.map((r: any, i: number) => (
                  <div key={i} className="glass rounded-xl p-4 border border-gray-500/20 min-w-[200px] text-center">
                    <p className="text-sm font-medium text-white">{r.InstanceDisplayName || r.ReplicaName || `Replica ${i + 1}`}</p>
                    <div className="flex items-center justify-center gap-2 mt-2">
                      {roleBadge(r)}
                      <span className="text-xs text-gray-400">{r.synchronization_health_desc || r.SyncState || '—'}</span>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1">{r.availability_mode_desc || r.SyncMode || ''}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Databases */}
      {databases.length > 0 && (
        <div className="glass rounded-xl overflow-hidden">
          <div className="p-4 border-b border-white/10">
            <h3 className="text-sm font-semibold text-white">Databases in AG</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Database</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Sync State</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Log Send Queue</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Redo Queue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {databases.map((d: any, i: number) => (
                <tr key={i} className="hover:bg-white/5">
                  <td className="px-4 py-2.5 text-white">{d.DatabaseName || d.name || '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-400">{d.synchronization_state_desc || d.SyncState || '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-400">{d.log_send_queue_size != null ? `${d.log_send_queue_size} KB` : '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-400">{d.redo_queue_size != null ? `${d.redo_queue_size} KB` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AvailabilityGroupsPage() {
  const [ags, setAgs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.availabilityGroups().catch(() => []);
        setAgs(Array.isArray(data) ? data : []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingSpinner />;

  if (selectedId !== null) {
    return <AGDetail id={selectedId} onBack={() => setSelectedId(null)} />;
  }

  if (ags.length === 0) return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">Availability Groups</h1>
      <EmptyState message="No Availability Groups found" />
    </div>
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">Availability Groups</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {ags.map((ag, i) => {
          const health = ag.synchronization_health || ag.HealthStatus || 1;
          return (
            <motion.div
              key={ag.AGId || i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => ag.AGId && setSelectedId(ag.AGId)}
              className="glass rounded-xl p-5 cursor-pointer hover:bg-white/5 transition-all border border-white/5 hover:border-blue-500/30"
            >
              <div className="flex items-center gap-3 mb-3">
                <Network className="w-5 h-5 text-blue-400" />
                <h3 className="text-sm font-medium text-white">{ag.AGName || ag.name || `AG ${ag.AGId}`}</h3>
              </div>
              <div className="space-y-2 text-xs text-gray-400">
                <p>Instance: {ag.InstanceDisplayName || '—'}</p>
                <p>Mode: {ag.availability_mode_desc || ag.SyncMode || '—'}</p>
              </div>
              <div className="mt-3">
                <StatusBadge status={health === 2 ? 1 : health === 1 ? 2 : health === 0 ? 4 : 3} size="xs" />
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
