import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/api';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import StatusBadge from '../components/StatusBadge';

export default function BackupsPage() {
  const { id } = useParams();
  const [summary, setSummary] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const s = await api.dashboardSummary().catch(() => []);
        setSummary(Array.isArray(s) ? s : []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingSpinner />;
  if (summary.length === 0) return <EmptyState message="No backup data available" />;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">{id ? 'Instance Backups' : 'Backups'}</h1>
      <p className="text-sm text-gray-400">Backup status overview across all instances</p>
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase">Instance</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-300 uppercase">Full</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-300 uppercase">Diff</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-300 uppercase">Log</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {summary.map((s, i) => (
              <tr key={i} className="hover:bg-slate-800/50">
                <td className="px-4 py-2.5 text-white">{s.InstanceDisplayName || s.ConnectionID || `Instance ${s.InstanceID}`}</td>
                <td className="px-4 py-2.5 text-center"><StatusBadge status={s.FullBackupStatus || 3} size="xs" /></td>
                <td className="px-4 py-2.5 text-center"><StatusBadge status={s.DiffBackupStatus || 3} size="xs" /></td>
                <td className="px-4 py-2.5 text-center"><StatusBadge status={s.LogBackupStatus || 3} size="xs" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
