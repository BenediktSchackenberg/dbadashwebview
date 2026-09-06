import { useEffect, useState } from 'react';
import { api } from '../api/api';
import type { InstanceListRow, MemoryClerkRow, MemoryCounterRow } from '../api/types';
import LoadingSpinner from '../components/LoadingSpinner';
import { motion } from 'framer-motion';
import { HardDrive } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid } from 'recharts';
import TimeRangeSelector from '../components/TimeRangeSelector';
import {
  aggregateLatestMemoryClerks,
  buildPageLifeExpectancySeries,
  summarizeMemoryCounters,
} from '../utils/memoryMetrics';

export default function MemoryPage() {
  const [clerks, setClerks] = useState<MemoryClerkRow[]>([]);
  const [counters, setCounters] = useState<MemoryCounterRow[]>([]);
  const [clerkNote, setClerkNote] = useState('');
  const [counterNote, setCounterNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [instances, setInstances] = useState<InstanceListRow[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<number | undefined>();
  const [hours, setHours] = useState(24);

  useEffect(() => {
    api.instances().then(i => setInstances(Array.isArray(i) ? i : [])).catch(() => {});
  }, []);

  useEffect(() => {
    api.performanceMemory(selectedInstance, hours)
      .then(r => {
        setClerks(Array.isArray(r.clerks) ? r.clerks : []);
        setCounters(Array.isArray(r.counters) ? r.counters : []);
        setClerkNote(r.clerkNote || '');
        setCounterNote(r.counterNote || '');
      })
      .catch(() => {
        setClerks([]);
        setCounters([]);
        setClerkNote('');
        setCounterNote('Unable to load memory data.');
      })
      .finally(() => setLoading(false));
  }, [selectedInstance, hours]);

  if (loading) return <LoadingSpinner />;

  const topClerks = aggregateLatestMemoryClerks(clerks);
  const {
    pageLifeExpectancy: ple,
    bufferPoolKb: bufferPool,
    memoryGrantsPending: grantsP,
  } = summarizeMemoryCounters(counters);

  // Memory counters over time for area chart
  const pleOverTime = buildPageLifeExpectancySeries(counters, selectedInstance == null)
    .map(point => ({ time: new Date(point.timestamp).toLocaleTimeString(), ple: point.ple }));

  const notes = [clerkNote, counterNote].filter(Boolean);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <HardDrive className="w-6 h-6 text-purple-400" />
          <h1 className="text-2xl font-bold text-white">Memory</h1>
        </div>
        <div className="flex items-center gap-3">
          <select value={selectedInstance ?? ''} onChange={e => {
            setLoading(true);
            setSelectedInstance(e.target.value ? Number(e.target.value) : undefined);
          }}
            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none">
            <option value="">All Instances</option>
            {instances.map((inst) => (
              <option key={inst.InstanceID} value={inst.InstanceID}>{inst.InstanceDisplayName || inst.Instance || inst.InstanceID}</option>
            ))}
          </select>
          <TimeRangeSelector value={hours} onChange={value => {
            setLoading(true);
            setHours(value);
          }} />
        </div>
      </div>

      {notes.length > 0 && (
        <div className="text-sm text-yellow-400/80 bg-yellow-400/5 border border-yellow-400/20 rounded-lg px-4 py-2">
          {notes.join(' | ')}
        </div>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: selectedInstance == null ? 'Lowest Page Life Expectancy' : 'Page Life Expectancy', value: ple != null ? `${ple}s` : 'N/A', color: 'text-blue-400' },
          { label: selectedInstance == null ? 'Total Buffer Pool' : 'Buffer Pool', value: bufferPool != null ? `${Math.round(bufferPool / 1024)} MB` : 'N/A', color: 'text-green-400' },
          { label: selectedInstance == null ? 'Total Memory Grants Pending' : 'Memory Grants Pending', value: grantsP != null ? grantsP : 'N/A', color: grantsP != null && grantsP > 0 ? 'text-red-400' : 'text-gray-400' },
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
