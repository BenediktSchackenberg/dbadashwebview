import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Activity, Cpu, MemoryStick, HardDrive } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../api/api';

const tooltipStyle = { backgroundColor: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' };

type SortKey = 'InstanceName' | 'cpu_count' | 'AvgCPU24h' | 'MaxCPU24h' | 'ramGb' | 'storUsed' | 'storTotal' | 'storPct';

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes >= 1099511627776) return (bytes / 1099511627776).toFixed(1) + ' TB';
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1024).toFixed(0) + ' KB';
}

export default function FleetStatsPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('AvgCPU24h');
  const [sortAsc, setSortAsc] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api.reportsFleetStats().then(d => { setData(Array.isArray(d) ? d : []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const totalCores = useMemo(() => data.reduce((s, r) => s + (r.cpu_count || 0), 0), [data]);
  const totalRam = useMemo(() => Math.round(data.reduce((s, r) => s + (r.physical_memory_kb || 0), 0) / 1048576), [data]);

  const avgFleetCpu = useMemo(() => {
    const totalWeighted = data.reduce((s, r) => s + (r.AvgCPU24h || 0) * (r.cpu_count || 1), 0);
    return totalCores > 0 ? totalWeighted / totalCores : 0;
  }, [data, totalCores]);

  const totalStorUsed = useMemo(() => data.reduce((s, r) => s + (r.TotalUsed || 0), 0), [data]);
  const totalStorCap = useMemo(() => data.reduce((s, r) => s + (r.TotalCapacity || 0), 0), [data]);

  // CPU buckets
  const cpuBuckets = useMemo(() => {
    const buckets = [
      { name: '0-5%', min: 0, max: 5, count: 0 }, { name: '5-10%', min: 5, max: 10, count: 0 },
      { name: '10-25%', min: 10, max: 25, count: 0 }, { name: '25-50%', min: 25, max: 50, count: 0 },
      { name: '50-75%', min: 50, max: 75, count: 0 }, { name: '75-100%', min: 75, max: 100, count: 0 },
    ];
    data.forEach(r => {
      const cpu = r.AvgCPU24h || 0;
      const b = buckets.find(b => cpu >= b.min && cpu < b.max) || buckets[buckets.length - 1];
      b.count++;
    });
    return buckets;
  }, [data]);

  // Top 10 CPU
  const top10Cpu = useMemo(() =>
    [...data].sort((a, b) => (b.AvgCPU24h || 0) - (a.AvgCPU24h || 0)).slice(0, 10).map(r => ({
      name: r.InstanceName, value: Math.round((r.AvgCPU24h || 0) * 100) / 100
    })),
  [data]);

  // RAM buckets
  const ramBuckets = useMemo(() => {
    const buckets = [
      { name: '<8GB', max: 8, count: 0 }, { name: '8-16GB', max: 16, count: 0 },
      { name: '16-32GB', max: 32, count: 0 }, { name: '32-64GB', max: 64, count: 0 },
      { name: '64-128GB', max: 128, count: 0 }, { name: '>128GB', max: Infinity, count: 0 },
    ];
    data.forEach(r => {
      const gb = (r.physical_memory_kb || 0) / 1048576;
      if (gb < 8) buckets[0].count++;
      else if (gb < 16) buckets[1].count++;
      else if (gb < 32) buckets[2].count++;
      else if (gb < 64) buckets[3].count++;
      else if (gb < 128) buckets[4].count++;
      else buckets[5].count++;
    });
    return buckets;
  }, [data]);

  // Top 10 storage
  const top10Storage = useMemo(() =>
    [...data].filter(r => r.TotalUsed > 0).sort((a, b) => (b.TotalUsed || 0) - (a.TotalUsed || 0)).slice(0, 10).map(r => ({
      name: r.InstanceName, value: Math.round((r.TotalUsed || 0) / 1073741824)
    })),
  [data]);

  const sorted = useMemo(() => {
    const copy = [...data];
    copy.sort((a, b) => {
      let av: any, bv: any;
      if (sortKey === 'ramGb') { av = a.physical_memory_kb || 0; bv = b.physical_memory_kb || 0; }
      else if (sortKey === 'storUsed') { av = a.TotalUsed || 0; bv = b.TotalUsed || 0; }
      else if (sortKey === 'storTotal') { av = a.TotalCapacity || 0; bv = b.TotalCapacity || 0; }
      else if (sortKey === 'storPct') {
        av = a.TotalCapacity ? (a.TotalUsed || 0) / a.TotalCapacity * 100 : 0;
        bv = b.TotalCapacity ? (b.TotalUsed || 0) / b.TotalCapacity * 100 : 0;
      }
      else { av = a[sortKey]; bv = b[sortKey]; }
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string') return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortAsc ? av - bv : bv - av;
    });
    return copy;
  }, [data, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(key === 'InstanceName'); }
  };

  const SortHeader = ({ k, label }: { k: SortKey; label: string }) => (
    <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort(k)}>
      {label} {sortKey === k ? (sortAsc ? '▲' : '▼') : ''}
    </th>
  );

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading...</div>;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center gap-3">
        <Activity className="w-6 h-6 text-blue-400" />
        <h1 className="text-2xl font-bold text-white">Fleet Statistics</h1>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Cpu, label: 'Total CPU Cores', value: totalCores.toLocaleString(), color: 'text-blue-400' },
          { icon: Activity, label: 'Avg Fleet CPU (24h)', value: avgFleetCpu.toFixed(1) + '%', color: 'text-purple-400' },
          { icon: MemoryStick, label: 'Total RAM', value: totalRam + ' GB', color: 'text-green-400' },
          { icon: HardDrive, label: 'Storage Used / Total', value: `${formatBytes(totalStorUsed)} / ${formatBytes(totalStorCap)}`, color: 'text-yellow-400' },
        ].map((c, i) => (
          <div key={i} className="glass rounded-xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <c.icon className={`w-5 h-5 ${c.color}`} />
              <span className="text-sm text-gray-400">{c.label}</span>
            </div>
            <div className="text-xl font-bold text-white">{c.value}</div>
          </div>
        ))}
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">CPU Usage Distribution</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={cpuBuckets}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#374151" tick={{ fill: '#6b7280', fontSize: 12 }} />
              <YAxis stroke="#374151" tick={{ fill: '#6b7280', fontSize: 12 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="glass rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Top 10 CPU Consumers (24h)</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={top10Cpu} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis type="number" stroke="#374151" tick={{ fill: '#6b7280', fontSize: 12 }} />
              <YAxis type="category" dataKey="name" width={150} stroke="#374151" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [`${v}%`, 'Avg CPU']} />
              <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">RAM Distribution</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={ramBuckets}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#374151" tick={{ fill: '#6b7280', fontSize: 12 }} />
              <YAxis stroke="#374151" tick={{ fill: '#6b7280', fontSize: 12 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="glass rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Top 10 Storage Usage (GB)</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={top10Storage} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis type="number" stroke="#374151" tick={{ fill: '#6b7280', fontSize: 12 }} />
              <YAxis type="category" dataKey="name" width={150} stroke="#374151" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [`${v} GB`, 'Used']} />
              <Bar dataKey="value" fill="#f59e0b" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Table */}
      <div className="glass rounded-xl p-6 overflow-x-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">All Instances</h2>
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-500/20 border border-red-500/30 inline-block"></span> Storage &gt; 85%</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-yellow-500/20 border border-yellow-500/30 inline-block"></span> Storage &gt; 70%</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-transparent border border-white/10 inline-block"></span> Normal</span>
          </div>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <SortHeader k="InstanceName" label="Instance" />
              <SortHeader k="cpu_count" label="CPU Cores" />
              <SortHeader k="AvgCPU24h" label="Avg CPU % (24h)" />
              <SortHeader k="MaxCPU24h" label="Max CPU % (24h)" />
              <SortHeader k="ramGb" label="RAM (GB)" />
              <SortHeader k="storUsed" label="Storage Used" />
              <SortHeader k="storTotal" label="Storage Total" />
              <SortHeader k="storPct" label="Storage %" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const storPct = r.TotalCapacity ? Math.round((r.TotalUsed || 0) / r.TotalCapacity * 100) : 0;
              const storClass = storPct > 85 ? 'bg-red-500/10' : storPct > 70 ? 'bg-yellow-500/10' : '';
              return (
                <tr key={i} className="border-b border-white/5 hover:bg-white/5 cursor-pointer" onClick={() => navigate(`/instances/${r.InstanceID}`)}>
                  <td className="px-3 py-2 text-sm text-gray-200">{r.InstanceName}</td>
                  <td className="px-3 py-2 text-sm text-gray-300">{r.cpu_count ?? '—'}</td>
                  <td className="px-3 py-2 text-sm text-gray-300">{r.AvgCPU24h != null ? r.AvgCPU24h.toFixed(1) + '%' : '—'}</td>
                  <td className="px-3 py-2 text-sm text-gray-300">{r.MaxCPU24h != null ? r.MaxCPU24h + '%' : '—'}</td>
                  <td className="px-3 py-2 text-sm text-gray-300">{r.physical_memory_kb ? Math.round(r.physical_memory_kb / 1048576) : '—'}</td>
                  <td className="px-3 py-2 text-sm text-gray-300">{r.TotalUsed ? formatBytes(r.TotalUsed) : '—'}</td>
                  <td className="px-3 py-2 text-sm text-gray-300">{r.TotalCapacity ? formatBytes(r.TotalCapacity) : '—'}</td>
                  <td className={`px-3 py-2 text-sm text-gray-300 ${storClass}`}>{r.TotalCapacity ? storPct + '%' : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {data.length === 0 && <p className="text-center text-gray-500 py-8">No data available</p>}
      </div>
    </motion.div>
  );
}
