import { useState, useEffect, useMemo } from 'react';
import { api } from '../api/api';
import { useRefresh } from '../App';
import LoadingSpinner from '../components/LoadingSpinner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

function ageHours(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return (Date.now() - new Date(dateStr).getTime()) / 3600000;
}

function ageColor(hours: number | null): string {
  if (hours == null) return 'text-gray-500';
  if (hours < 24) return 'text-emerald-400';
  if (hours < 48) return 'text-yellow-400';
  return 'text-red-400';
}

function ageBg(hours: number | null): string {
  if (hours == null) return 'bg-gray-500/10';
  if (hours < 24) return 'bg-emerald-500/10';
  if (hours < 48) return 'bg-yellow-500/10';
  return 'bg-red-500/10';
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

  const { grouped, rpoChart, complianceScore } = useMemo(() => {
    const byInstance = new Map<string, Map<string, { full: string | null; diff: string | null; log: string | null }>>();

    data.forEach((b: any) => {
      const inst = b.InstanceDisplayName || `Instance ${b.InstanceID}`;
      const db = b.DatabaseName || `DB ${b.DatabaseID}`;
      if (!byInstance.has(inst)) byInstance.set(inst, new Map());
      const dbs = byInstance.get(inst)!;
      if (!dbs.has(db)) dbs.set(db, { full: null, diff: null, log: null });
      const entry = dbs.get(db)!;
      const type = b.type;
      const date = b.backup_start_date;
      if (type === 'D' && (!entry.full || date > entry.full)) entry.full = date;
      if (type === 'I' && (!entry.diff || date > entry.diff)) entry.diff = date;
      if (type === 'L' && (!entry.log || date > entry.log)) entry.log = date;
    });

    const grouped = [...byInstance.entries()].map(([inst, dbs]) => ({
      instance: inst,
      databases: [...dbs.entries()].map(([db, b]) => ({ db, ...b })),
    }));

    // RPO distribution
    const buckets = { '<1h': 0, '1-4h': 0, '4-12h': 0, '12-24h': 0, '>24h': 0 };
    let totalDbs = 0, compliant = 0;
    grouped.forEach(g => g.databases.forEach(d => {
      totalDbs++;
      const h = ageHours(d.full);
      if (h == null) { buckets['>24h']++; return; }
      if (h < 1) buckets['<1h']++;
      else if (h < 4) buckets['1-4h']++;
      else if (h < 12) buckets['4-12h']++;
      else if (h < 24) { buckets['12-24h']++; compliant++; }
      else buckets['>24h']++;
      if (h < 24) compliant++;
    }));

    const rpoChart = Object.entries(buckets).map(([name, count]) => ({ name, count }));
    const complianceScore = totalDbs > 0 ? Math.round((compliant / totalDbs) * 100) : 0;

    return { grouped, rpoChart, complianceScore };
  }, [data]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Estate Backups & RPO</h1>
        <div className="glass rounded-lg px-4 py-2">
          <span className="text-sm text-gray-400">Compliance: </span>
          <span className={`text-lg font-bold ${complianceScore >= 90 ? 'text-emerald-400' : complianceScore >= 70 ? 'text-yellow-400' : 'text-red-400'}`}>
            {complianceScore}%
          </span>
        </div>
      </div>

      <div className="glass rounded-xl p-6 gradient-border">
        <h3 className="text-lg font-semibold text-white mb-3">RPO Distribution</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={rpoChart}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
            <XAxis dataKey="name" stroke="#6b7280" tick={{ fontSize: 12 }} />
            <YAxis stroke="#6b7280" tick={{ fontSize: 12 }} />
            <Tooltip contentStyle={{ backgroundColor: '#1e1e2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
            <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {grouped.map(g => (
        <div key={g.instance} className="glass rounded-xl p-6 gradient-border">
          <h3 className="text-lg font-semibold text-white mb-3">{g.instance}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left">
                  <th className="pb-2 text-gray-300 font-semibold">Database</th>
                  <th className="pb-2 text-gray-300 font-semibold">Full Backup</th>
                  <th className="pb-2 text-gray-300 font-semibold">Diff Backup</th>
                  <th className="pb-2 text-gray-300 font-semibold">Log Backup</th>
                </tr>
              </thead>
              <tbody>
                {g.databases.map(d => (
                  <tr key={d.db} className="border-b border-white/5">
                    <td className="py-2 text-gray-300">{d.db}</td>
                    {(['full', 'diff', 'log'] as const).map(t => {
                      const val = d[t];
                      const h = ageHours(val);
                      return (
                        <td key={t} className="py-2">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs ${ageBg(h)} ${ageColor(h)}`}>
                            {val ? `${h!.toFixed(1)}h ago` : 'None'}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {grouped.length === 0 && <p className="text-gray-500 text-sm text-center py-8">No backup data available.</p>}
    </div>
  );
}
