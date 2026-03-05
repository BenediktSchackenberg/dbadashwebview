import { useState, useEffect } from 'react';
import { api } from '../api/api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Search as SearchIcon } from 'lucide-react';

export default function QueryStorePage() {
  const [data, setData] = useState<any[]>([]);
  const [instances, setInstances] = useState<any[]>([]);
  const [instanceId, setInstanceId] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');
  const [sortBy, setSortBy] = useState<'avgCpuTime' | 'avgDuration' | 'countExecutions'>('avgCpuTime');

  useEffect(() => { api.instances().then(setInstances).catch(() => {}); }, []);
  useEffect(() => {
    if (!instanceId) return;
    setLoading(true);
    api.performanceQueryStore(instanceId).then(r => { setData(r.data || []); setNote(r.note || ''); }).finally(() => setLoading(false));
  }, [instanceId]);

  const sorted = [...data].sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0));
  const top10 = sorted.slice(0, 10);
  const inputCls = "bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500/50";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white flex items-center gap-3"><SearchIcon className="w-7 h-7 text-blue-400" /> Query Store</h1>
      <div className="flex gap-3 items-center flex-wrap">
        <select value={instanceId || ''} onChange={e => setInstanceId(Number(e.target.value) || undefined)} className={inputCls}>
          <option value="">Select Instance...</option>
          {instances.map((inst: any) => <option key={inst.instanceID} value={inst.instanceID}>{inst.instanceDisplayName || inst.instance}</option>)}
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} className={inputCls}>
          <option value="avgCpuTime">Sort by CPU</option>
          <option value="avgDuration">Sort by Duration</option>
          <option value="countExecutions">Sort by Exec Count</option>
        </select>
      </div>
      {note && <p className="text-xs text-amber-400/70">{note}</p>}
      {!instanceId ? <p className="text-gray-500 text-sm">Select an instance to view Query Store data.</p> :
        loading ? <div className="text-gray-400">Loading...</div> : (
        <>
          {top10.length > 0 && (
            <div className="glass rounded-xl p-5 gradient-border">
              <h3 className="text-sm font-semibold text-gray-400 mb-4">Top 10 by {sortBy === 'avgCpuTime' ? 'CPU' : sortBy === 'avgDuration' ? 'Duration' : 'Executions'}</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={top10} layout="vertical"><XAxis type="number" stroke="#4b5563" /><YAxis type="category" dataKey="objectName" width={200} stroke="#4b5563" tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: '#1a1f36', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                  <Bar dataKey={sortBy} radius={[0, 4, 4, 0]}>{top10.map((_, i) => <Cell key={i} fill={i < 3 ? '#ef4444' : i < 6 ? '#f59e0b' : '#3b82f6'} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="glass rounded-xl p-5 gradient-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-white/10 text-left text-gray-400">
                <th className="pb-2">Query/Object</th><th className="pb-2">Execs</th><th className="pb-2">Avg CPU (ms)</th><th className="pb-2">Avg Duration (ms)</th><th className="pb-2">Avg Reads</th>
              </tr></thead>
              <tbody>{sorted.map((d, i) => (
                <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-2 text-white max-w-xs truncate" title={d.querySqlText}>{d.objectName || d.querySqlText?.substring(0, 80)}</td>
                  <td className="py-2 text-gray-300">{d.countExecutions?.toLocaleString()}</td>
                  <td className="py-2 text-gray-300">{d.avgCpuTime?.toFixed(1)}</td>
                  <td className="py-2 text-gray-300">{d.avgDuration?.toFixed(1)}</td>
                  <td className="py-2 text-gray-300">{d.avgLogicalIoReads?.toLocaleString()}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
