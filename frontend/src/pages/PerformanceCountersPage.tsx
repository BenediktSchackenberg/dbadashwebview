import { useEffect, useState, useMemo } from 'react';
import { api } from '../api/api';
import LoadingSpinner from '../components/LoadingSpinner';
import { motion } from 'framer-motion';
import { Gauge } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const COLORS = ['#3b82f6','#ef4444','#f59e0b','#10b981','#8b5cf6','#ec4899','#06b6d4','#f97316'];

export default function PerformanceCountersPage() {
  const [data, setData] = useState<any[]>([]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [instances, setInstances] = useState<any[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<number | undefined>();
  const [hours, setHours] = useState(24);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.instances().then(i => setInstances(Array.isArray(i) ? i : [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedInstance) { setData([]); setLoading(false); return; }
    setLoading(true);
    api.performanceCounters(selectedInstance, hours)
      .then(r => { setData(Array.isArray(r.data) ? r.data : []); setNote(r.note || ''); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedInstance, hours]);

  // Group by object_name (category)
  const categories = useMemo(() => {
    const map = new Map<string, Map<string, { time: string; value: number }[]>>();
    data.forEach(d => {
      const cat = d.object_name || 'Unknown';
      const counter = d.counter_name || 'Unknown';
      if (!map.has(cat)) map.set(cat, new Map());
      const catMap = map.get(cat)!;
      if (!catMap.has(counter)) catMap.set(counter, []);
      catMap.get(counter)!.push({
        time: new Date(d.SnapshotDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        value: d.cntr_value || 0,
      });
    });
    return map;
  }, [data]);

  const filteredCategories = useMemo(() => {
    if (!search) return [...categories.entries()];
    const q = search.toLowerCase();
    return [...categories.entries()].filter(([cat, counters]) =>
      cat.toLowerCase().includes(q) || [...counters.keys()].some(c => c.toLowerCase().includes(q))
    );
  }, [categories, search]);

  // Key counters for quick charts
  const keyCounterNames = ['Page life expectancy', 'Batch Requests/sec', 'SQL Compilations/sec', 'Buffer cache hit ratio'];
  const keyCounters = useMemo(() => {
    const result: { name: string; data: { time: string; value: number }[] }[] = [];
    categories.forEach((counters) => {
      counters.forEach((points, name) => {
        if (keyCounterNames.some(k => name.includes(k)) && !result.find(r => r.name === name)) {
          result.push({ name, data: points });
        }
      });
    });
    return result;
  }, [categories]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
            <Gauge className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Performance Counters</h1>
            <p className="text-sm text-gray-400">SQL Server performance counters over time</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <input type="text" placeholder="Search counters..." value={search} onChange={e => setSearch(e.target.value)}
            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-gray-300 placeholder-gray-500 w-48" />
          <select value={hours} onChange={e => setHours(Number(e.target.value))} className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-gray-300">
            <option value={1}>1h</option><option value={6}>6h</option><option value={12}>12h</option><option value={24}>24h</option><option value={72}>3d</option>
          </select>
          <select value={selectedInstance ?? ''} onChange={e => setSelectedInstance(e.target.value ? Number(e.target.value) : undefined)} className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-gray-300">
            <option value="">Select Instance</option>
            {instances.map((inst: any) => <option key={inst.InstanceID} value={inst.InstanceID}>{inst.InstanceDisplayName || inst.InstanceID}</option>)}
          </select>
        </div>
      </div>

      {!selectedInstance && <div className="glass-card p-8 text-center text-gray-500">Select an instance to view performance counters</div>}
      {note && <div className="glass-card p-3 text-xs text-yellow-400">{note}</div>}

      {keyCounters.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {keyCounters.map((kc, idx) => (
            <motion.div key={kc.name} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }} className="glass-card p-4">
              <h3 className="text-sm font-semibold text-white mb-3">{kc.name}</h3>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={kc.data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="time" stroke="#6b7280" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#6b7280" tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: 'rgba(17,24,39,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                  <Line type="monotone" dataKey="value" stroke={COLORS[idx % COLORS.length]} dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </motion.div>
          ))}
        </div>
      )}

      {filteredCategories.map(([cat, counters], ci) => (
        <motion.div key={cat} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + ci * 0.03 }} className="glass-card overflow-hidden">
          <div className="p-4 border-b border-white/10">
            <h2 className="text-sm font-semibold text-cyan-400">{cat}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-white/10">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Counter</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Latest Value</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Data Points</th>
                </tr>
              </thead>
              <tbody>
                {[...counters.entries()].map(([name, points]) => (
                  <tr key={name} className="border-b border-white/5 hover:bg-slate-800/50">
                    <td className="px-3 py-2 text-white">{name}</td>
                    <td className="px-3 py-2 text-cyan-400">{points.length > 0 ? points[points.length - 1].value.toLocaleString() : '-'}</td>
                    <td className="px-3 py-2 text-gray-400">{points.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
