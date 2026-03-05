import { useState, useEffect } from 'react';
import { Shield, Server } from 'lucide-react';
import { api } from '../api/api';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface PatchInfo { instanceId: number; instanceName: string; productVersion: string; productMajorVersion: number; edition: string }

const VERSION_COLORS: Record<string, string> = { '16': '#10b981', '15': '#3b82f6', '14': '#f59e0b', '13': '#ef4444', '12': '#8b5cf6' };
const getVersionLabel = (v: number) => ({ 16: 'SQL 2022', 15: 'SQL 2019', 14: 'SQL 2017', 13: 'SQL 2016', 12: 'SQL 2014', 11: 'SQL 2012' }[v] || `SQL v${v}`);

export default function PatchingPage() {
  const [data, setData] = useState<PatchInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.monitoringPatching().then(r => setData(r.data || [])).finally(() => setLoading(false)); }, []);

  const versionGroups = data.reduce<Record<number, PatchInfo[]>>((acc, d) => {
    (acc[d.productMajorVersion] = acc[d.productMajorVersion] || []).push(d);
    return acc;
  }, {});
  const pieData = Object.entries(versionGroups).map(([v, items]) => ({ name: getVersionLabel(Number(v)), value: items.length, version: v }));

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white flex items-center gap-3"><Shield className="w-7 h-7 text-blue-400" /> SQL Patching</h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="glass rounded-xl p-5 gradient-border">
          <h3 className="text-sm font-semibold text-gray-400 mb-4">Version Distribution</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value" label={({ name, value }) => `${name} (${value})`}>
              {pieData.map((e, i) => <Cell key={i} fill={VERSION_COLORS[e.version] || '#6b7280'} />)}
            </Pie><Tooltip /></PieChart>
          </ResponsiveContainer>
        </div>
        <div className="lg:col-span-2 glass rounded-xl p-5 gradient-border">
          <h3 className="text-sm font-semibold text-gray-400 mb-4">All Instances ({data.length})</h3>
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#0a0f1e]"><tr className="border-b border-white/10 text-left">
                <th className="pb-2 text-gray-400">Instance</th><th className="pb-2 text-gray-400">Version</th><th className="pb-2 text-gray-400">Edition</th><th className="pb-2 text-gray-400">Build</th>
              </tr></thead>
              <tbody>{data.map((d, i) => (
                <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-2 text-white flex items-center gap-2"><Server className="w-4 h-4 text-gray-500" />{d.instanceName}</td>
                  <td className="py-2"><span className="px-2 py-0.5 rounded text-xs" style={{ backgroundColor: (VERSION_COLORS[String(d.productMajorVersion)] || '#6b7280') + '20', color: VERSION_COLORS[String(d.productMajorVersion)] || '#6b7280' }}>{getVersionLabel(d.productMajorVersion)}</span></td>
                  <td className="py-2 text-gray-400">{d.edition}</td>
                  <td className="py-2 text-gray-500 font-mono text-xs">{d.productVersion}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
