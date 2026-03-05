import { useEffect, useState, useMemo } from 'react';
import { api } from '../api/api';
import LoadingSpinner from '../components/LoadingSpinner';
import { motion } from 'framer-motion';
import { Clock } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const COLORS = ['#3b82f6','#ef4444','#f59e0b','#10b981','#8b5cf6','#ec4899','#06b6d4','#f97316','#84cc16','#6366f1'];

export default function WaitsTimelinePage() {
  const [data, setData] = useState<any[]>([]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [instances, setInstances] = useState<any[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<number | undefined>();
  const [hours, setHours] = useState(24);

  useEffect(() => {
    api.instances().then(i => setInstances(Array.isArray(i) ? i : [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedInstance) { setData([]); setLoading(false); return; }
    setLoading(true);
    api.performanceWaitsTimeline(selectedInstance, hours)
      .then(r => { setData(Array.isArray(r.data) ? r.data : []); setNote(r.note || ''); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedInstance, hours]);

  // Get top wait types and build time-series
  const { chartData, waitTypes, totals } = useMemo(() => {
    const totalsMap = new Map<string, { wait_time_ms: number; waiting_tasks_count: number; signal_wait_time_ms: number }>();
    data.forEach(d => {
      const wt = d.WaitType || 'Unknown';
      const cur = totalsMap.get(wt) || { wait_time_ms: 0, waiting_tasks_count: 0, signal_wait_time_ms: 0 };
      cur.wait_time_ms += d.wait_time_ms || 0;
      cur.waiting_tasks_count += d.waiting_tasks_count || 0;
      cur.signal_wait_time_ms += d.signal_wait_time_ms || 0;
      totalsMap.set(wt, cur);
    });
    const sortedTypes = [...totalsMap.entries()].sort((a, b) => b[1].wait_time_ms - a[1].wait_time_ms);
    const topTypes = sortedTypes.slice(0, 10).map(e => e[0]);
    const totals = sortedTypes.map(([wt, v]) => ({ WaitType: wt, ...v }));

    // Group by time bucket
    const timeMap = new Map<string, Record<string, number>>();
    data.forEach(d => {
      const t = new Date(d.SnapshotDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (!timeMap.has(t)) timeMap.set(t, { time: t as any });
      const entry = timeMap.get(t)!;
      const wt = d.WaitType || 'Unknown';
      if (topTypes.includes(wt)) entry[wt] = (entry[wt] || 0) + (d.wait_time_ms || 0);
    });
    return { chartData: [...timeMap.values()], waitTypes: topTypes, totals };
  }, [data]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
            <Clock className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Waits Timeline</h1>
            <p className="text-sm text-gray-400">Wait type distribution over time</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select value={hours} onChange={e => setHours(Number(e.target.value))} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300">
            <option value={1}>1h</option><option value={6}>6h</option><option value={12}>12h</option><option value={24}>24h</option><option value={72}>3d</option>
          </select>
          <select value={selectedInstance ?? ''} onChange={e => setSelectedInstance(e.target.value ? Number(e.target.value) : undefined)} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300">
            <option value="">Select Instance</option>
            {instances.map((inst: any) => <option key={inst.InstanceID} value={inst.InstanceID}>{inst.InstanceDisplayName || inst.InstanceID}</option>)}
          </select>
        </div>
      </div>

      {!selectedInstance && <div className="glass-card p-8 text-center text-gray-500">Select an instance to view waits timeline</div>}
      {note && <div className="glass-card p-3 text-xs text-yellow-400">{note}</div>}

      {selectedInstance && chartData.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Top Wait Types Over Time</h2>
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="time" stroke="#6b7280" tick={{ fontSize: 11 }} />
              <YAxis stroke="#6b7280" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: 'rgba(17,24,39,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
              {waitTypes.map((wt, i) => (
                <Area key={wt} type="monotone" dataKey={wt} stackId="1" fill={COLORS[i % COLORS.length]} stroke={COLORS[i % COLORS.length]} fillOpacity={0.6} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>
      )}

      {selectedInstance && totals.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card overflow-hidden">
          <div className="p-4 border-b border-white/10">
            <h2 className="text-lg font-semibold text-white">Wait Type Totals</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-white/10">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Wait Type</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Total Wait (ms)</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Waiting Tasks</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Signal Wait (ms)</th>
                </tr>
              </thead>
              <tbody>
                {totals.slice(0, 50).map((d, i) => (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                    <td className="px-3 py-2 text-white font-medium">{d.WaitType}</td>
                    <td className="px-3 py-2 text-purple-400">{d.wait_time_ms.toLocaleString()}</td>
                    <td className="px-3 py-2 text-gray-300">{d.waiting_tasks_count.toLocaleString()}</td>
                    <td className="px-3 py-2 text-gray-300">{d.signal_wait_time_ms.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </div>
  );
}
