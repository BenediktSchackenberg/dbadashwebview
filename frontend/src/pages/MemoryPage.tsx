import { useEffect, useState } from 'react';
import { api } from '../api/api';
import LoadingSpinner from '../components/LoadingSpinner';
import { motion } from 'framer-motion';
import { HardDrive } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid } from 'recharts';

export default function MemoryPage() {
  const [clerks, setClerks] = useState<any[]>([]);
  const [counters, setCounters] = useState<any[]>([]);
  const [clerkNote, setClerkNote] = useState('');
  const [counterNote, setCounterNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [instances, setInstances] = useState<any[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<number | undefined>();

  useEffect(() => {
    api.instances().then(i => setInstances(Array.isArray(i) ? i : [])).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    api.performanceMemory(selectedInstance)
      .then(r => {
        setClerks(Array.isArray(r.clerks) ? r.clerks : []);
        setCounters(Array.isArray(r.counters) ? r.counters : []);
        setClerkNote(r.clerkNote || '');
        setCounterNote(r.counterNote || '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedInstance]);

  if (loading) return <LoadingSpinner />;

  // Aggregate top clerks by name
  const clerkAgg = new Map<string, number>();
  clerks.forEach(c => {
    const name = c.clerk_name || c.clerk_type || 'Unknown';
    clerkAgg.set(name, (clerkAgg.get(name) || 0) + (c.pages_kb || 0));
  });
  const topClerks = [...clerkAgg.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name, kb]) => ({ name: name.length > 30 ? name.slice(0, 30) + '...' : name, sizeMB: Math.round(kb / 1024) }));

  // Key memory counters
  const getCounter = (name: string) => {
    const c = counters.find(c => c.counter_name?.includes(name));
    return c ? c.cntr_value : null;
  };
  const ple = getCounter('Page life expectancy');
  const bufferPool = getCounter('Database Cache Memory');
  const grantsP = getCounter('Memory Grants Pending');

  // Memory counters over time for area chart
  const pleOverTime = counters
    .filter(c => c.counter_name?.includes('Page life expectancy'))
    .sort((a, b) => new Date(a.SnapshotDate).getTime() - new Date(b.SnapshotDate).getTime())
    .map(c => ({ time: new Date(c.SnapshotDate).toLocaleTimeString(), ple: c.cntr_value }));

  const notes = [clerkNote, counterNote].filter(Boolean);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <HardDrive className="w-6 h-6 text-purple-400" />
          <h1 className="text-2xl font-bold text-white">Memory</h1>
        </div>
        <select value={selectedInstance ?? ''} onChange={e => setSelectedInstance(e.target.value ? Number(e.target.value) : undefined)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none">
          <option value="">All Instances</option>
          {instances.map((inst: any) => (
            <option key={inst.InstanceID} value={inst.InstanceID}>{inst.InstanceDisplayName}</option>
          ))}
        </select>
      </div>

      {notes.length > 0 && (
        <div className="text-sm text-yellow-400/80 bg-yellow-400/5 border border-yellow-400/20 rounded-lg px-4 py-2">
          {notes.join(' | ')}
        </div>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Page Life Expectancy', value: ple != null ? `${ple}s` : 'N/A', color: 'text-blue-400' },
          { label: 'Buffer Pool', value: bufferPool != null ? `${Math.round(bufferPool / 1024)} MB` : 'N/A', color: 'text-green-400' },
          { label: 'Memory Grants Pending', value: grantsP != null ? grantsP : 'N/A', color: grantsP && grantsP > 0 ? 'text-red-400' : 'text-gray-400' },
        ].map(m => (
          <motion.div key={m.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-ultra rounded-2xl p-5">
            <div className="text-xs text-gray-500 mb-1">{m.label}</div>
            <div className={`text-2xl font-bold ${m.color}`}>{m.value}</div>
          </motion.div>
        ))}
      </div>

      {/* Top Memory Clerks */}
      {topClerks.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-ultra rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Top Memory Clerks (MB)</h2>
          <ResponsiveContainer width="100%" height={Math.max(200, topClerks.length * 30)}>
            <BarChart data={topClerks} layout="vertical" margin={{ left: 120 }}>
              <XAxis type="number" stroke="#555" tick={{ fill: '#888', fontSize: 11 }} />
              <YAxis type="category" dataKey="name" stroke="#555" tick={{ fill: '#aaa', fontSize: 11 }} width={120} />
              <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff' }} />
              <Bar dataKey="sizeMB" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      )}

      {/* PLE Over Time */}
      {pleOverTime.length > 1 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-ultra rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Page Life Expectancy Over Time</h2>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={pleOverTime}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="time" stroke="#555" tick={{ fill: '#888', fontSize: 10 }} />
              <YAxis stroke="#555" tick={{ fill: '#888', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff' }} />
              <Area type="monotone" dataKey="ple" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>
      )}

      {clerks.length === 0 && counters.length === 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-ultra rounded-2xl p-12 text-center">
          <HardDrive className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">No memory data available</p>
        </motion.div>
      )}
    </div>
  );
}
