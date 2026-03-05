import { useState, useEffect } from 'react';
import { api } from '../api/api';
import { Thermometer } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function TempDBPage() {
  const [data, setData] = useState<any[]>([]);
  const [instances, setInstances] = useState<any[]>([]);
  const [instanceId, setInstanceId] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => { api.instances().then(setInstances).catch(() => {}); }, []);
  useEffect(() => {
    if (!instanceId) { setData([]); return; }
    setLoading(true);
    api.monitoringTempDB(instanceId).then(r => { setData(r.data || []); setNote(r.note || ''); }).finally(() => setLoading(false));
  }, [instanceId]);

  const inputCls = "bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500/50";
  const chartData = data.map(d => ({ name: d.name || `File ${d.fileId}`, sizeMb: (d.sizeKb || 0) / 1024, usedMb: (d.usedKb || 0) / 1024 }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white flex items-center gap-3"><Thermometer className="w-7 h-7 text-orange-400" /> TempDB</h1>
      <select value={instanceId || ''} onChange={e => setInstanceId(Number(e.target.value) || undefined)} className={inputCls}>
        <option value="">Select Instance...</option>
        {instances.map((inst: any) => <option key={inst.instanceID} value={inst.instanceID}>{inst.instanceDisplayName || inst.instance}</option>)}
      </select>
      {note && <p className="text-xs text-amber-400/70">{note}</p>}
      {!instanceId ? <p className="text-gray-500 text-sm">Select an instance to view TempDB info.</p> :
        loading ? <div className="text-gray-400">Loading...</div> :
        data.length === 0 ? <p className="text-gray-500 text-sm">No TempDB data found.</p> : (
        <>
          <div className="glass rounded-xl p-5 gradient-border">
            <h3 className="text-sm font-semibold text-gray-400 mb-4">TempDB Files — Size vs Used (MB)</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData}><XAxis dataKey="name" stroke="#4b5563" tick={{ fontSize: 11 }} /><YAxis stroke="#4b5563" />
                <Tooltip contentStyle={{ background: '#1a1f36', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                <Bar dataKey="sizeMb" name="Size (MB)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="usedMb" name="Used (MB)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="glass rounded-xl p-5 gradient-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-white/10 text-left text-gray-400">
                <th className="pb-2">File</th><th className="pb-2">Size (MB)</th><th className="pb-2">Used (MB)</th><th className="pb-2">Free (MB)</th><th className="pb-2">% Used</th>
              </tr></thead>
              <tbody>{data.map((d, i) => {
                const sizeMb = (d.sizeKb || 0) / 1024;
                const usedMb = (d.usedKb || 0) / 1024;
                const pct = sizeMb > 0 ? (usedMb / sizeMb * 100) : 0;
                return (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-2 text-white">{d.name || `File ${d.fileId}`}</td>
                    <td className="py-2 text-gray-300">{sizeMb.toFixed(1)}</td>
                    <td className="py-2 text-gray-300">{usedMb.toFixed(1)}</td>
                    <td className="py-2 text-gray-300">{(sizeMb - usedMb).toFixed(1)}</td>
                    <td className="py-2"><span className={`text-xs font-medium ${pct > 80 ? 'text-red-400' : pct > 50 ? 'text-amber-400' : 'text-emerald-400'}`}>{pct.toFixed(1)}%</span></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
