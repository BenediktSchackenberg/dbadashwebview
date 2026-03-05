import { useEffect, useState } from 'react';
import { api } from '../api/api';
import LoadingSpinner from '../components/LoadingSpinner';
import { motion } from 'framer-motion';
import { HardDrive } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

export default function IOPerformancePage() {
  const [fileStats, setFileStats] = useState<any[]>([]);
  const [drivePerf, setDrivePerf] = useState<any[]>([]);
  const [fileNote, setFileNote] = useState('');
  const [driveNote, setDriveNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [instances, setInstances] = useState<any[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<number | undefined>();

  useEffect(() => {
    api.instances().then(i => setInstances(Array.isArray(i) ? i : [])).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    api.performanceIO(selectedInstance)
      .then(r => {
        setFileStats(Array.isArray(r.fileStats) ? r.fileStats : []);
        setDrivePerf(Array.isArray(r.drivePerf) ? r.drivePerf : []);
        setFileNote(r.fileNote || '');
        setDriveNote(r.driveNote || '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedInstance]);

  if (loading) return <LoadingSpinner />;

  const notes = [fileNote, driveNote].filter(Boolean);

  // Aggregate file stats by database for latency chart
  const dbLatency = new Map<string, { readMs: number; writeMs: number; reads: number; writes: number }>();
  fileStats.forEach(f => {
    const key = `${f.InstanceDisplayName} / ${f.database_name || 'Unknown'}`;
    const existing = dbLatency.get(key) || { readMs: 0, writeMs: 0, reads: 0, writes: 0 };
    existing.readMs += f.io_stall_read_ms || 0;
    existing.writeMs += f.io_stall_write_ms || 0;
    existing.reads += f.num_of_reads || 0;
    existing.writes += f.num_of_writes || 0;
    dbLatency.set(key, existing);
  });

  const latencyData = [...dbLatency.entries()]
    .map(([name, v]) => ({
      name: name.length > 40 ? name.slice(0, 40) + '...' : name,
      avgReadMs: v.reads > 0 ? Math.round(v.readMs / v.reads) : 0,
      avgWriteMs: v.writes > 0 ? Math.round(v.writeMs / v.writes) : 0,
    }))
    .sort((a, b) => (b.avgReadMs + b.avgWriteMs) - (a.avgReadMs + a.avgWriteMs))
    .slice(0, 15);

  // IOPS chart
  const iopsData = [...dbLatency.entries()]
    .map(([name, v]) => ({
      name: name.length > 40 ? name.slice(0, 40) + '...' : name,
      reads: v.reads,
      writes: v.writes,
    }))
    .sort((a, b) => (b.reads + b.writes) - (a.reads + a.writes))
    .slice(0, 15);

  const fmtBytes = (b: number | null) => {
    if (b == null) return '-';
    if (b > 1e12) return `${(b / 1e12).toFixed(1)} TB`;
    if (b > 1e9) return `${(b / 1e9).toFixed(1)} GB`;
    if (b > 1e6) return `${(b / 1e6).toFixed(1)} MB`;
    return `${(b / 1024).toFixed(0)} KB`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <HardDrive className="w-6 h-6 text-cyan-400" />
          <h1 className="text-2xl font-bold text-white">IO Performance</h1>
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

      {/* Latency Chart */}
      {latencyData.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-ultra rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Average IO Latency (ms per operation)</h2>
          <ResponsiveContainer width="100%" height={Math.max(200, latencyData.length * 30)}>
            <BarChart data={latencyData} layout="vertical" margin={{ left: 160 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis type="number" stroke="#555" tick={{ fill: '#888', fontSize: 11 }} />
              <YAxis type="category" dataKey="name" stroke="#555" tick={{ fill: '#aaa', fontSize: 10 }} width={160} />
              <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff' }} />
              <Legend />
              <Bar dataKey="avgReadMs" name="Read Latency" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              <Bar dataKey="avgWriteMs" name="Write Latency" fill="#ef4444" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      )}

      {/* IOPS Chart */}
      {iopsData.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-ultra rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">IO Operations</h2>
          <ResponsiveContainer width="100%" height={Math.max(200, iopsData.length * 30)}>
            <BarChart data={iopsData} layout="vertical" margin={{ left: 160 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis type="number" stroke="#555" tick={{ fill: '#888', fontSize: 11 }} />
              <YAxis type="category" dataKey="name" stroke="#555" tick={{ fill: '#aaa', fontSize: 10 }} width={160} />
              <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff' }} />
              <Legend />
              <Bar dataKey="reads" name="Reads" fill="#22c55e" radius={[0, 4, 4, 0]} />
              <Bar dataKey="writes" name="Writes" fill="#f59e0b" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      )}

      {/* File Stats Table */}
      {fileStats.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-ultra rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-white/10">
            <h2 className="text-sm font-semibold text-gray-300">Per-File IO Stats</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left">
                  <th className="px-4 py-3 text-gray-400 font-medium">Instance</th>
                  <th className="px-4 py-3 text-gray-400 font-medium">Database</th>
                  <th className="px-4 py-3 text-gray-400 font-medium">File</th>
                  <th className="px-4 py-3 text-gray-400 font-medium">Read Stall (ms)</th>
                  <th className="px-4 py-3 text-gray-400 font-medium">Write Stall (ms)</th>
                  <th className="px-4 py-3 text-gray-400 font-medium">Reads</th>
                  <th className="px-4 py-3 text-gray-400 font-medium">Writes</th>
                  <th className="px-4 py-3 text-gray-400 font-medium">Bytes Read</th>
                  <th className="px-4 py-3 text-gray-400 font-medium">Bytes Written</th>
                </tr>
              </thead>
              <tbody>
                {fileStats.slice(0, 50).map((row, i) => (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 text-gray-300">{row.InstanceDisplayName}</td>
                    <td className="px-4 py-3 text-gray-300">{row.database_name || '-'}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs font-mono">{row.file_name || '-'}</td>
                    <td className="px-4 py-3 text-gray-300">{row.io_stall_read_ms?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-300">{row.io_stall_write_ms?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-300">{row.num_of_reads?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-300">{row.num_of_writes?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-300">{fmtBytes(row.num_of_bytes_read)}</td>
                    <td className="px-4 py-3 text-gray-300">{fmtBytes(row.num_of_bytes_written)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {fileStats.length === 0 && drivePerf.length === 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-ultra rounded-2xl p-12 text-center">
          <HardDrive className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">No IO performance data available</p>
        </motion.div>
      )}
    </div>
  );
}
