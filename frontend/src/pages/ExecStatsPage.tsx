import { useEffect, useState, useMemo } from 'react';
import { api } from '../api/api';
import LoadingSpinner from '../components/LoadingSpinner';
import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

type SortKey = 'object_name' | 'SchemaName' | 'execution_count' | 'total_worker_time' | 'avg_cpu' | 'total_elapsed_time' | 'avg_duration' | 'total_logical_reads' | 'total_logical_writes';

export default function ExecStatsPage() {
  const [data, setData] = useState<any[]>([]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [instances, setInstances] = useState<any[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<number | undefined>();
  const [sortKey, setSortKey] = useState<SortKey>('total_worker_time');
  const [sortAsc, setSortAsc] = useState(false);
  const [hours, setHours] = useState(24);

  useEffect(() => {
    api.instances().then(i => setInstances(Array.isArray(i) ? i : [])).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    api.performanceExecStats(selectedInstance, hours)
      .then(r => { setData(Array.isArray(r.data) ? r.data : []); setNote(r.note || ''); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedInstance, hours]);

  const enriched = useMemo(() => data.map(d => ({
    ...d,
    avg_cpu: d.execution_count > 0 ? Math.round(d.total_worker_time / d.execution_count / 1000) : 0,
    avg_duration: d.execution_count > 0 ? Math.round(d.total_elapsed_time / d.execution_count / 1000) : 0,
    total_cpu_ms: Math.round(d.total_worker_time / 1000),
    total_dur_ms: Math.round(d.total_elapsed_time / 1000),
  })), [data]);

  const sorted = useMemo(() => {
    const s = [...enriched].sort((a, b) => {
      const av = a[sortKey] ?? 0, bv = b[sortKey] ?? 0;
      return sortAsc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
    return s;
  }, [enriched, sortKey, sortAsc]);

  const top10 = useMemo(() =>
    [...enriched].sort((a, b) => b.total_cpu_ms - a.total_cpu_ms).slice(0, 10)
      .map(d => ({ name: (d.object_name || '').slice(0, 25), cpu: d.total_cpu_ms })),
    [enriched]
  );

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const SortHeader = ({ label, k }: { label: string; k: SortKey }) => (
    <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 cursor-pointer hover:text-white select-none" onClick={() => handleSort(k)}>
      {label} {sortKey === k ? (sortAsc ? ' \u25B2' : ' \u25BC') : ''}
    </th>
  );

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
            <Zap className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Object Execution Stats</h1>
            <p className="text-sm text-gray-400">CPU, duration, and IO metrics per object</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select value={hours} onChange={e => setHours(Number(e.target.value))} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300">
            <option value={1}>1h</option><option value={6}>6h</option><option value={12}>12h</option><option value={24}>24h</option><option value={72}>3d</option>
          </select>
          <select value={selectedInstance ?? ''} onChange={e => setSelectedInstance(e.target.value ? Number(e.target.value) : undefined)} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300">
            <option value="">All Instances</option>
            {instances.map((inst: any) => <option key={inst.InstanceID} value={inst.InstanceID}>{inst.InstanceDisplayName || inst.InstanceID}</option>)}
          </select>
        </div>
      </div>

      {note && <div className="glass-card p-3 text-xs text-yellow-400">{note}</div>}

      {top10.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Top 10 by CPU (ms)</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={top10} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis type="number" stroke="#6b7280" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={180} stroke="#6b7280" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: 'rgba(17,24,39,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
              <Bar dataKey="cpu" fill="#f97316" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      )}

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-white/10">
              <tr>
                <SortHeader label="Object Name" k="object_name" />
                <SortHeader label="Schema" k="SchemaName" />
                <SortHeader label="Exec Count" k="execution_count" />
                <SortHeader label="Total CPU (ms)" k="total_worker_time" />
                <SortHeader label="Avg CPU (ms)" k="avg_cpu" />
                <SortHeader label="Total Duration (ms)" k="total_elapsed_time" />
                <SortHeader label="Avg Duration (ms)" k="avg_duration" />
                <SortHeader label="Total Reads" k="total_logical_reads" />
                <SortHeader label="Total Writes" k="total_logical_writes" />
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 200).map((d, i) => (
                <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-3 py-2 text-white font-medium">{d.object_name}</td>
                  <td className="px-3 py-2 text-gray-400">{d.SchemaName}</td>
                  <td className="px-3 py-2 text-gray-300">{(d.execution_count ?? 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-orange-400">{d.total_cpu_ms.toLocaleString()}</td>
                  <td className="px-3 py-2 text-gray-300">{d.avg_cpu.toLocaleString()}</td>
                  <td className="px-3 py-2 text-gray-300">{d.total_dur_ms.toLocaleString()}</td>
                  <td className="px-3 py-2 text-gray-300">{d.avg_duration.toLocaleString()}</td>
                  <td className="px-3 py-2 text-gray-300">{(d.total_logical_reads ?? 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-gray-300">{(d.total_logical_writes ?? 0).toLocaleString()}</td>
                </tr>
              ))}
              {sorted.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-500">No execution stats found</td></tr>}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
