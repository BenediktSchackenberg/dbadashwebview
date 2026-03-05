import { useState, useEffect } from 'react';
import { api } from '../api/api';
import { Database } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function DBSpacePage() {
  const [data, setData] = useState<any[]>([]);
  const [instances, setInstances] = useState<any[]>([]);
  const [instanceId, setInstanceId] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => { api.instances().then(setInstances).catch(() => {}); }, []);
  useEffect(() => {
    if (!instanceId) { setData([]); return; }
    setLoading(true);
    api.monitoringDBSpace(instanceId).then(r => { setData(r.data || []); setNote(r.note || ''); }).finally(() => setLoading(false));
  }, [instanceId]);

  const inputCls = "bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500/50";

  // Group by database for chart
  const dbGroups = data.reduce<Record<string, { data: number; log: number }>>((acc, d) => {
    const db = d.databaseName || 'Unknown';
    if (!acc[db]) acc[db] = { data: 0, log: 0 };
    const sizeMb = (d.sizeKb || 0) / 1024;
    if (d.typeDesc === 'LOG') acc[db].log += sizeMb; else acc[db].data += sizeMb;
    return acc;
  }, {});
  const chartData = Object.entries(dbGroups).map(([name, v]) => ({ name, ...v })).sort((a, b) => (b.data + b.log) - (a.data + a.log)).slice(0, 15);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white flex items-center gap-3"><Database className="w-7 h-7 text-blue-400" /> Database Space</h1>
      <select value={instanceId || ''} onChange={e => setInstanceId(Number(e.target.value) || undefined)} className={inputCls}>
        <option value="">Select Instance...</option>
        {instances.map((inst: any) => <option key={inst.instanceID} value={inst.instanceID}>{inst.instanceDisplayName || inst.instance}</option>)}
      </select>
      {note && <p className="text-xs text-amber-400/70">{note}</p>}
      {!instanceId ? <p className="text-gray-500 text-sm">Select an instance to view database space.</p> :
        loading ? <div className="text-gray-400">Loading...</div> :
        data.length === 0 ? <p className="text-gray-500 text-sm">No database space data found.</p> : (
        <>
          {chartData.length > 0 && (
            <div className="glass rounded-xl p-6 gradient-border">
              <h3 className="text-sm font-semibold text-gray-400 mb-4">Top Databases by Size (MB)</h3>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={chartData} layout="vertical"><XAxis type="number" stroke="#4b5563" /><YAxis type="category" dataKey="name" width={180} stroke="#4b5563" tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: '#1a1f36', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                  <Legend /><Bar dataKey="data" name="Data (MB)" fill="#3b82f6" stackId="a" /><Bar dataKey="log" name="Log (MB)" fill="#8b5cf6" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="glass rounded-xl p-6 gradient-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-white/10 text-left text-gray-300 font-semibold">
                <th className="pb-2">Database</th><th className="pb-2">File</th><th className="pb-2">Type</th><th className="pb-2">Size (MB)</th><th className="pb-2">Used (MB)</th><th className="pb-2">Growth</th>
              </tr></thead>
              <tbody>{data.map((d, i) => (
                <tr key={i} className="border-b border-white/5 hover:bg-slate-800/50">
                  <td className="py-2 text-white">{d.databaseName}</td>
                  <td className="py-2 text-gray-300">{d.fileName}</td>
                  <td className="py-2"><span className={`px-1.5 py-0.5 rounded text-xs ${d.typeDesc === 'LOG' ? 'bg-purple-500/10 text-purple-400' : 'bg-blue-500/10 text-blue-400'}`}>{d.typeDesc || 'DATA'}</span></td>
                  <td className="py-2 text-gray-300">{((d.sizeKb || 0) / 1024).toFixed(1)}</td>
                  <td className="py-2 text-gray-300">{((d.usedKb || 0) / 1024).toFixed(1)}</td>
                  <td className="py-2 text-gray-500 text-xs">{d.isPercentGrowth ? `${d.growth}%` : `${((d.growth || 0) * 8 / 1024).toFixed(0)} MB`}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
