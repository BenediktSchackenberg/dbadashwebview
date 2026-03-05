import { useState, useEffect, useMemo } from 'react';
import { api } from '../api/api';
import { useRefresh } from '../App';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Loader2 } from 'lucide-react';

function ageHours(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  return (Date.now() - new Date(dateStr).getTime()) / 3600000;
}

function ageBadge(hours: number | null): { text: string; cls: string } {
  if (hours == null) return { text: 'No Backup', cls: 'text-gray-500 bg-gray-500/10' };
  if (hours < 24) return { text: `${hours.toFixed(1)}h ago`, cls: 'text-emerald-400 bg-emerald-500/10' };
  if (hours < 48) return { text: `${hours.toFixed(0)}h ago`, cls: 'text-yellow-400 bg-yellow-500/10' };
  const days = Math.floor(hours / 24);
  return { text: `${days}d ago`, cls: 'text-red-400 bg-red-500/10' };
}

export default function EstateBackupsPage() {
  const { lastRefresh } = useRefresh();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.backupsEstate().then(d => setData(Array.isArray(d) ? d : []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [lastRefresh]);

  const { grouped, rpoChart } = useMemo(() => {
    const byInstance = new Map<string, { id: number; dbs: any[] }>();

    data.forEach((row: any) => {
      const inst = row.instanceDisplayName || row.InstanceDisplayName || `Instance ${row.instanceID || row.InstanceID}`;
      const id = row.instanceID || row.InstanceID;
      if (!byInstance.has(inst)) byInstance.set(inst, { id, dbs: [] });
      byInstance.get(inst)!.dbs.push({
        db: row.databaseName || row.DatabaseName || `DB ${row.databaseID || row.DatabaseID}`,
        full: row.fullBackupDate || row.FullBackupDate || null,
        diff: row.diffBackupDate || row.DiffBackupDate || null,
        log: row.logBackupDate || row.LogBackupDate || null,
      });
    });

    const grouped = [...byInstance.entries()].map(([inst, v]) => ({
      instance: inst,
      instanceId: v.id,
      databases: v.dbs,
    }));

    // RPO distribution based on full backups
    const buckets = { '<1h': 0, '1-4h': 0, '4-12h': 0, '12-24h': 0, '>24h': 0, 'None': 0 };
    grouped.forEach(g => g.databases.forEach(d => {
      const h = ageHours(d.full);
      if (h == null) buckets['None']++;
      else if (h < 1) buckets['<1h']++;
      else if (h < 4) buckets['1-4h']++;
      else if (h < 12) buckets['4-12h']++;
      else if (h < 24) buckets['12-24h']++;
      else buckets['>24h']++;
    }));
    const rpoChart = Object.entries(buckets).filter(([,c]) => c > 0).map(([name, count]) => ({ name, count }));

    return { grouped, rpoChart };
  }, [data]);

  if (loading) return (
    <div className="glass rounded-xl p-12 flex flex-col items-center justify-center gap-4">
      <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
      <p className="text-gray-300 text-lg">Loading backup status across all instances...</p>
      <p className="text-gray-500 text-sm">This may take a moment</p>
    </div>
  );

  const totalDbs = grouped.reduce((s, g) => s + g.databases.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Backups</h1>
          <p className="text-sm text-gray-400 mt-1">Backup status overview across all instances — {grouped.length} instances, {totalDbs} databases</p>
        </div>
      </div>

      {rpoChart.length > 0 && (
        <div className="glass rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wider">Full Backup Age Distribution</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={rpoChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" stroke="#6b7280" tick={{ fontSize: 12 }} />
              <YAxis stroke="#6b7280" tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }} />
              <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-800/80">
              <th className="py-2 px-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Instance</th>
              <th className="py-2 px-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Database</th>
              <th className="py-2 px-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-400">Full</th>
              <th className="py-2 px-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-400">Diff</th>
              <th className="py-2 px-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-400">Log</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {grouped.flatMap(g => g.databases.map((d, i) => (
              <tr key={`${g.instance}-${d.db}`} className="hover:bg-slate-800/50 transition-colors">
                <td className="py-2 px-3 text-gray-300 whitespace-nowrap">
                  {i === 0 ? <span className="font-medium text-white">{g.instance}</span> : ''}
                </td>
                <td className="py-2 px-3 text-gray-300">{d.db}</td>
                {(['full', 'diff', 'log'] as const).map(t => {
                  const h = ageHours(d[t]);
                  const badge = ageBadge(h);
                  return (
                    <td key={t} className="py-2 px-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${badge.cls}`}>
                        {badge.text}
                      </span>
                    </td>
                  );
                })}
              </tr>
            )))}
          </tbody>
        </table>
      </div>

      {grouped.length === 0 && <p className="text-gray-500 text-sm text-center py-8">No backup data available.</p>}
    </div>
  );
}
